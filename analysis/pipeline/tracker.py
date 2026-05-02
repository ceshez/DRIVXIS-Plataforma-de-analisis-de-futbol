from __future__ import annotations

from pathlib import Path
from typing import Any

from .calibration import transform_position
from .common import (
    add_detection_count,
    build_class_mapping,
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
    model_path: Path,
    video_info: dict[str, Any],
    calibration: dict[str, Any],
    match_info: dict[str, Any],
    deps: dict[str, Any],
) -> dict[str, Any]:
    cv2 = deps["cv2"]
    np = deps["np"]
    sv = deps["sv"]
    YOLO = deps["YOLO"]
    frame_count_hint = int(video_info["frameCount"])
    frame_size = video_info["frameSize"]

    log(f"Loading YOLO model: {model_path}")
    model = YOLO(str(model_path))
    class_names, class_ids_by_name = build_class_mapping(getattr(model, "names", {}))
    log(f"Model classes: {class_names}")

    tracker = sv.ByteTrack(
        track_activation_threshold=0.18,
        lost_track_buffer=max(30, min(90, int(round(float(video_info["fps"] or 24) * 2)))),
        minimum_matching_threshold=0.72,
        frame_rate=max(1, int(round(float(video_info["fps"] or 24)))),
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
    total_counts: dict[str, int] = {}
    batch_counts: dict[str, int] = {}
    frame_num = 0

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        fail(f"Could not reopen video for analysis: {input_path}")

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

        result = model.predict(frame, conf=0.1, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)

        _original_xyxy, original_class_id, _original_tracker = detection_arrays(detections)
        if original_class_id is not None:
            for class_id_item in original_class_id:
                class_name = class_names.get(int(class_id_item), f"class_{int(class_id_item)}")
                add_detection_count(batch_counts, class_name)
                add_detection_count(total_counts, class_name)

        goalkeeper_bboxes = []
        raw_detection_xyxy = getattr(detections, "xyxy", None)
        raw_detection_classes = getattr(detections, "class_id", None)
        if raw_detection_xyxy is not None and raw_detection_classes is not None:
            goalkeeper_bboxes = [
                bbox.tolist()
                for index, bbox in enumerate(raw_detection_xyxy)
                if class_names.get(int(raw_detection_classes[index]), "") == "goalkeeper"
            ]

        if getattr(detections, "class_id", None) is not None and "goalkeeper" in class_ids_by_name:
            player_id = class_ids_by_name.get("player")
            goalkeeper_id = class_ids_by_name.get("goalkeeper")
            if player_id is not None and goalkeeper_id is not None:
                detections.class_id = np.array([player_id if int(class_id) == goalkeeper_id else int(class_id) for class_id in detections.class_id])

        raw_xyxy, raw_class_id, _raw_tracker = detection_arrays(detections)
        tracked = tracker.update_with_detections(detections)

        frame_players: dict[int, dict[str, Any]] = {}
        frame_referees: dict[int, dict[str, Any]] = {}
        frame_ball: dict[int, dict[str, Any]] = {}

        xyxy, class_id, tracker_id = detection_arrays(tracked)
        for index, bbox in enumerate(xyxy):
            current_class = int(class_id[index])
            current_tracker = tracker_id[index] if tracker_id is not None else None
            if current_tracker is None:
                continue

            class_name = class_names.get(current_class, "")
            item = {"bbox": bbox.tolist()}
            if class_name == "player":
                if is_goalkeeper_bbox(item["bbox"], goalkeeper_bboxes):
                    item["role"] = "goalkeeper"
                    item["isGoalkeeper"] = True
                frame_players[int(current_tracker)] = item
            elif class_name == "referee":
                frame_referees[int(current_tracker)] = item

        for index, bbox in enumerate(raw_xyxy):
            if class_names.get(int(raw_class_id[index]), "") == "ball":
                frame_ball[1] = {"bbox": bbox.tolist()}
                break

        for object_name, frame_tracks in (("players", frame_players), ("referees", frame_referees), ("ball", frame_ball)):
            for track_info in frame_tracks.values():
                bbox = track_info["bbox"]
                position = center_of_bbox(bbox) if object_name == "ball" else foot_position(bbox)
                adjusted = (position[0] - camera_movement[0], position[1] - camera_movement[1])
                track_info["position"] = position
                track_info["position_adjusted"] = adjusted
                track_info["position_transformed"] = transform_position(adjusted, calibration, deps)

        assigner.mark_contaminated_tracks(frame_players)
        if frame_num < 120 or assigner.kmeans is None:
            assigner.collect_samples(frame, frame_players)
        for player_id, player in frame_players.items():
            team_info = assigner.get_player_team_info(frame, player["bbox"], player_id)
            team = int(team_info["team"])
            player["team"] = team
            player["team_color"] = assigner.get_draw_color(team)
            if "jersey_color" in team_info:
                player["jersey_color"] = team_info["jersey_color"]
            if "team_color_distance" in team_info:
                player["team_color_distance"] = team_info["team_color_distance"]
                player["nearest_color_distance"] = team_info.get("nearest_color_distance", team_info["team_color_distance"])
                player["other_color_distance"] = team_info.get("other_color_distance", 0.0)
                player["team_confidence"] = team_info.get("team_confidence", 0.0)

        tracks["players"].append(frame_players)
        tracks["referees"].append(frame_referees)
        tracks["ball"].append(frame_ball)
        frame_num += 1

        if frame_num % 30 == 0:
            log(f"Frames {frame_num - 29}-{frame_num}: {format_detection_counts(batch_counts)}")
            batch_counts = {}
            if frame_count_hint > 0:
                log_progress(12 + round((frame_num / frame_count_hint) * 58), "tracking objects")

        del source_frame
        del frame

    capture.release()

    if frame_num == 0:
        fail("The input video has no readable frames.")
    if batch_counts:
        log(f"Frames {max(1, frame_num - (frame_num % 30) + 1)}-{frame_num}: {format_detection_counts(batch_counts)}")
    log(f"Detection totals: {format_detection_counts(total_counts)}")
    log(f"Tracking pass completed: frames={frame_num}")
    return {"tracks": tracks, "frameCount": frame_num, "detectedTeamColors": assigner.get_detected_colors()}


def is_goalkeeper_bbox(bbox: list[float], goalkeeper_bboxes: list[list[float]]) -> bool:
    return any(bbox_iou(bbox, goalkeeper_bbox) >= 0.55 for goalkeeper_bbox in goalkeeper_bboxes)
