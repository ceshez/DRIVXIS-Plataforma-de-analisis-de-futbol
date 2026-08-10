from __future__ import annotations

from pathlib import Path
from typing import Any

from .calibration import transform_position
from .common import (
    add_detection_count,
    detection_arrays,
    fail,
    format_detection_counts,
    log,
    log_progress,
    resize_for_analysis,
    measure_distance,
    bbox_iou,
    center_of_bbox,
    foot_position,
)
from .locate_anything import CLASS_IDS, CLASS_NAMES
from .team_assigner import TeamAssigner


class CameraMovementEstimator:
    def __init__(self, first_frame: Any, deps: dict[str, Any]) -> None:
        self.cv2 = deps["cv2"]
        self.np = deps["np"]
        _height, width = first_frame.shape[:2]
        self.old_gray = self.cv2.cvtColor(first_frame, self.cv2.COLOR_BGR2GRAY)
        self.mask = self.np.zeros_like(self.old_gray)
        self.mask[:, : max(20, int(width * 0.04))] = 1
        self.mask[:, int(width * 0.45) : int(width * 0.55)] = 1
        self.feature_params = dict(maxCorners=100, qualityLevel=0.3, minDistance=3, blockSize=7, mask=self.mask)
        self.lk_params = dict(
            winSize=(15, 15),
            maxLevel=2,
            criteria=(self.cv2.TERM_CRITERIA_EPS | self.cv2.TERM_CRITERIA_COUNT, 10, 0.03),
        )
        self.old_features = self.cv2.goodFeaturesToTrack(self.old_gray, **self.feature_params)

    def update(self, frame: Any) -> list[float]:
        if self.old_features is None:
            self.old_gray = self.cv2.cvtColor(frame, self.cv2.COLOR_BGR2GRAY)
            self.old_features = self.cv2.goodFeaturesToTrack(self.old_gray, **self.feature_params)
            return [0.0, 0.0]

        frame_gray = self.cv2.cvtColor(frame, self.cv2.COLOR_BGR2GRAY)
        new_features, status, _error = self.cv2.calcOpticalFlowPyrLK(self.old_gray, frame_gray, self.old_features, None, **self.lk_params)
        if new_features is None or status is None:
            self.old_gray = frame_gray.copy()
            self.old_features = self.cv2.goodFeaturesToTrack(self.old_gray, **self.feature_params)
            return [0.0, 0.0]

        max_distance = 0.0
        camera_x = 0.0
        camera_y = 0.0
        for new, old, ok in zip(new_features, self.old_features, status):
            if not ok:
                continue
            new_point = new.ravel()
            old_point = old.ravel()
            distance = measure_distance(new_point, old_point)
            if distance > max_distance:
                max_distance = distance
                camera_x = float(old_point[0] - new_point[0])
                camera_y = float(old_point[1] - new_point[1])

        if max_distance > 5:
            self.old_features = self.cv2.goodFeaturesToTrack(frame_gray, **self.feature_params)
        self.old_gray = frame_gray.copy()
        return [camera_x, camera_y] if max_distance > 5 else [0.0, 0.0]


def process_video_pass(
    input_path: Path,
    model_id: str,
    model_revision: str,
    detection_fps: float,
    batch_size: int,
    video_info: dict[str, Any],
    calibration: dict[str, Any],
    match_info: dict[str, Any],
    deps: dict[str, Any],
    detector: Any | None = None,
) -> dict[str, Any]:
    cv2 = deps["cv2"]
    np = deps["np"]
    sv = deps["sv"]
    frame_count_hint = int(video_info["frameCount"])
    frame_size = video_info["frameSize"]
    source_fps = max(0.1, float(video_info["fps"] or 24))
    effective_detection_fps = max(0.1, min(float(detection_fps), source_fps))
    batch_size = max(1, int(batch_size))

    if detector is None:
        from .locate_anything import LocateAnythingDetector

        detector = LocateAnythingDetector(model_id=model_id, revision=model_revision)
    detector_name = getattr(detector, "model_path", None) or f"{model_id}@{model_revision}"
    log(f"Loading detector: {detector_name}")
    log(f"Detection profile: fps={effective_detection_fps:.3f} batchSize={batch_size}")

    tracker = sv.ByteTrack(
        track_activation_threshold=0.18,
        lost_track_buffer=max(6, min(60, int(round(effective_detection_fps * 2)))),
        minimum_matching_threshold=0.72,
        frame_rate=max(1, int(round(effective_detection_fps))),
        minimum_consecutive_frames=1,
    )
    assigner = TeamAssigner.from_match_info(deps["KMeans"], match_info)
    if assigner.color_anchors:
        log(
            "Using user supplied team color anchors: "
            f"team1={match_info.get('ownTeamColor') or 'auto'} "
            f"team2={match_info.get('rivalTeamColor') or 'auto'}"
        )
    camera_estimator: CameraMovementEstimator | None = None
    tracks: dict[str, list[dict[int, dict[str, Any]]]] = {"players": [], "referees": [], "ball": []}
    camera_movements: list[list[float]] = []
    total_counts: dict[str, int] = {}
    batch_counts: dict[str, int] = {}
    pending_samples: list[tuple[int, Any]] = []
    last_sample_slot = -1
    sampled_frames = 0
    frame_num = 0
    estimated_samples = (
        max(1, int(round(frame_count_hint * effective_detection_fps / source_fps)))
        if frame_count_hint > 0
        else 0
    )

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        fail(f"Could not reopen video for analysis: {input_path}")

    def flush_detection_batch() -> None:
        nonlocal pending_samples, sampled_frames, batch_counts
        if not pending_samples:
            return
        batch_frames = [frame for _frame_index, frame in pending_samples]
        batch_results = detector.detect_batch(batch_frames)
        for (frame_index, frame), raw_items in zip(pending_samples, batch_results):
            sampled_frames += 1
            for item in raw_items:
                add_detection_count(batch_counts, item["class_name"])
                add_detection_count(total_counts, item["class_name"])

            goalkeeper_bboxes = [
                item["bbox"] for item in raw_items if item["class_name"] == "goalkeeper"
            ]
            raw_xyxy = np.asarray([item["bbox"] for item in raw_items], dtype=float).reshape((-1, 4))
            raw_class_ids = np.asarray(
                [CLASS_IDS[item["class_name"]] for item in raw_items],
                dtype=int,
            )
            tracking_class_ids = np.asarray(
                [CLASS_IDS["player"] if item["class_name"] == "goalkeeper" else CLASS_IDS[item["class_name"]] for item in raw_items],
                dtype=int,
            )
            confidences = np.asarray(
                [float(item.get("confidence", 1.0)) for item in raw_items],
                dtype=float,
            )
            detections = sv.Detections(
                xyxy=raw_xyxy,
                confidence=confidences,
                class_id=tracking_class_ids,
            )
            tracked = tracker.update_with_detections(detections)

            frame_players: dict[int, dict[str, Any]] = {}
            frame_referees: dict[int, dict[str, Any]] = {}
            frame_ball: dict[int, dict[str, Any]] = {}
            xyxy, class_ids, tracker_ids = detection_arrays(tracked)
            for index, bbox in enumerate(xyxy):
                current_tracker = tracker_ids[index] if tracker_ids is not None else None
                if current_tracker is None:
                    continue
                class_name = CLASS_NAMES.get(int(class_ids[index]), "")
                item = {"bbox": bbox.tolist()}
                if class_name == "player":
                    if is_goalkeeper_bbox(item["bbox"], goalkeeper_bboxes):
                        item["role"] = "goalkeeper"
                        item["isGoalkeeper"] = True
                    frame_players[int(current_tracker)] = item
                elif class_name == "referee":
                    frame_referees[int(current_tracker)] = item

            for index, bbox in enumerate(raw_xyxy):
                if CLASS_NAMES.get(int(raw_class_ids[index]), "") == "ball":
                    frame_ball[1] = {"bbox": bbox.tolist()}
                    break

            assigner.mark_contaminated_tracks(frame_players)
            if sampled_frames <= 120 or assigner.kmeans is None:
                assigner.collect_samples(frame, frame_players)
            for player_id, player in frame_players.items():
                team_info = assigner.get_player_team_info(frame, player["bbox"], player_id)
                team = int(team_info["team"])
                player["team"] = team
                player["team_color"] = assigner.get_draw_color(team)
                player["team_confidence"] = float(team_info.get("team_confidence", 0.0))
                if "team_assignment_state" in team_info:
                    player["team_assignment_state"] = team_info["team_assignment_state"]
                if "jersey_color" in team_info:
                    player["jersey_color"] = team_info["jersey_color"]
                if "team_color_distance" in team_info:
                    player["team_color_distance"] = team_info["team_color_distance"]
                    player["nearest_color_distance"] = team_info.get(
                        "nearest_color_distance", team_info["team_color_distance"]
                    )
                    player["other_color_distance"] = team_info.get("other_color_distance", 0.0)

            tracks["players"][frame_index] = frame_players
            tracks["referees"][frame_index] = frame_referees
            tracks["ball"][frame_index] = frame_ball

            if sampled_frames % 30 == 0:
                log(f"Sampled frames through {frame_index + 1}: {format_detection_counts(batch_counts)}")
                batch_counts = {}
            if estimated_samples > 0:
                log_progress(
                    12 + round((sampled_frames / estimated_samples) * 58),
                    "detecting objects",
                )
        pending_samples = []

    while True:
        ok, source_frame = capture.read()
        if not ok:
            break

        frame = resize_for_analysis(source_frame, frame_size, deps)
        if camera_estimator is None:
            camera_estimator = CameraMovementEstimator(frame, deps)
            camera_movement = [0.0, 0.0]
        else:
            camera_movement = camera_estimator.update(frame)
        camera_movements.append(camera_movement)
        tracks["players"].append({})
        tracks["referees"].append({})
        tracks["ball"].append({})

        should_sample, sample_slot = should_sample_frame(
            frame_num,
            source_fps,
            effective_detection_fps,
            last_sample_slot,
        )
        if should_sample:
            last_sample_slot = sample_slot
            pending_samples.append((frame_num, frame.copy()))
            if len(pending_samples) >= batch_size:
                flush_detection_batch()
        frame_num += 1

        del source_frame
        del frame

    capture.release()
    flush_detection_batch()

    if frame_num == 0:
        fail("The input video has no readable frames.")
    detector.ensure_acceptable_failure_rate()
    interpolate_track_gaps(tracks["players"], source_fps, max_gap_seconds=1.0)
    interpolate_track_gaps(tracks["referees"], source_fps, max_gap_seconds=1.0)
    interpolate_track_gaps(tracks["ball"], source_fps, max_gap_seconds=0.4)
    populate_track_positions(tracks, camera_movements, calibration, deps)
    if batch_counts:
        log(f"Final sampled frames: {format_detection_counts(batch_counts)}")
    log(f"Detection totals across {sampled_frames} sampled frames: {format_detection_counts(total_counts)}")
    log(f"Tracking pass completed: sourceFrames={frame_num} sampledFrames={sampled_frames}")
    return {
        "tracks": tracks,
        "frameCount": frame_num,
        "detectedTeamColors": assigner.get_detected_colors(),
        "inference": detector.build_inference_metadata(
            detection_fps=effective_detection_fps,
            batch_size=batch_size,
            frame_size=frame_size,
        ),
    }


def should_sample_frame(
    frame_index: int,
    source_fps: float,
    detection_fps: float,
    last_sample_slot: int,
) -> tuple[bool, int]:
    slot = int((max(0, frame_index) * detection_fps) / max(0.1, source_fps) + 1e-9)
    return slot > last_sample_slot, slot


def interpolate_track_gaps(
    frame_tracks: list[dict[int, dict[str, Any]]],
    fps: float,
    max_gap_seconds: float,
) -> None:
    observations: dict[int, list[int]] = {}
    for frame_index, items in enumerate(frame_tracks):
        for track_id in items:
            observations.setdefault(track_id, []).append(frame_index)

    maximum_frame_distance = max(1, int(round(max_gap_seconds * max(0.1, fps))))
    for track_id, frame_indices in observations.items():
        for left_index, right_index in zip(frame_indices, frame_indices[1:]):
            frame_distance = right_index - left_index
            if frame_distance <= 1 or frame_distance > maximum_frame_distance:
                continue
            left = frame_tracks[left_index][track_id]
            right = frame_tracks[right_index][track_id]
            left_bbox = left.get("bbox")
            right_bbox = right.get("bbox")
            if not left_bbox or not right_bbox:
                continue
            for frame_index in range(left_index + 1, right_index):
                alpha = (frame_index - left_index) / frame_distance
                nearest = left if alpha < 0.5 else right
                item = dict(nearest)
                item["bbox"] = [
                    float(left_value) + (float(right_value) - float(left_value)) * alpha
                    for left_value, right_value in zip(left_bbox, right_bbox)
                ]
                item["interpolated"] = True
                frame_tracks[frame_index][track_id] = item


def populate_track_positions(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    camera_movements: list[list[float]],
    calibration: dict[str, Any],
    deps: dict[str, Any],
) -> None:
    for frame_index, camera_movement in enumerate(camera_movements):
        for object_name in ("players", "referees", "ball"):
            for track_info in tracks[object_name][frame_index].values():
                bbox = track_info["bbox"]
                position = center_of_bbox(bbox) if object_name == "ball" else foot_position(bbox)
                adjusted = (position[0] - camera_movement[0], position[1] - camera_movement[1])
                track_info["position"] = position
                track_info["position_adjusted"] = adjusted
                track_info["position_transformed"] = transform_position(adjusted, calibration, deps)


def is_goalkeeper_bbox(bbox: list[float], goalkeeper_bboxes: list[list[float]]) -> bool:
    return any(bbox_iou(bbox, goalkeeper_bbox) >= 0.55 for goalkeeper_bbox in goalkeeper_bboxes)
