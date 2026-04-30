from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


PITCH_LENGTH_METERS = 105.0
PITCH_WIDTH_METERS = 68.0
SPEED_WINDOW_FRAMES = 5
MAX_VALID_SAMPLE_KMH = 40.0
MAX_SPEED_DELTA_KMH = 28.0


def log(message: str) -> None:
    print(f"[DRIVXIS analysis] {message}", flush=True)


def log_progress(progress: int, phase: str) -> None:
    bounded = max(0, min(99, int(progress)))
    print(f"[DRIVXIS progress] {json.dumps({'progress': bounded, 'phase': phase})}", flush=True)


def fail(message: str, code: int = 1) -> None:
    print(f"DRIVXIS analysis error: {message}", file=sys.stderr)
    raise SystemExit(code)


def load_runtime_dependencies() -> dict[str, Any]:
    try:
        import cv2
        import imageio_ffmpeg
        import numpy as np
        import supervision as sv
        from sklearn.cluster import KMeans
        from ultralytics import YOLO
    except ModuleNotFoundError as error:
        fail(
            "Missing Python dependency "
            f"'{error.name}'. Run: pip install -r analysis/requirements.txt"
        )

    return {
        "cv2": cv2,
        "imageio_ffmpeg": imageio_ffmpeg,
        "np": np,
        "sv": sv,
        "KMeans": KMeans,
        "YOLO": YOLO,
    }


def center_of_bbox(bbox: list[float]) -> tuple[int, int]:
    x1, y1, x2, y2 = bbox
    return int((x1 + x2) / 2), int((y1 + y2) / 2)


def foot_position(bbox: list[float]) -> tuple[int, int]:
    x1, _y1, x2, y2 = bbox
    return int((x1 + x2) / 2), int(y2)


def measure_distance(p1: Any, p2: Any) -> float:
    return math.sqrt((float(p1[0]) - float(p2[0])) ** 2 + (float(p1[1]) - float(p2[1])) ** 2)


def detection_arrays(detections: Any) -> tuple[Any, Any, Any]:
    xyxy = getattr(detections, "xyxy", [])
    class_id = getattr(detections, "class_id", [])
    tracker_id = getattr(detections, "tracker_id", None)
    return xyxy, class_id, tracker_id


EXPECTED_CLASS_ALIASES = {
    "player": {"player", "players", "person"},
    "goalkeeper": {"goalkeeper", "goalie", "keeper", "gk"},
    "referee": {"referee", "ref", "official"},
    "ball": {"ball", "football", "soccer_ball", "soccer-ball"},
}


def normalize_class_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


def iter_model_classes(class_names: Any) -> list[tuple[int, str]]:
    if isinstance(class_names, dict):
        return [(int(class_id), str(name)) for class_id, name in class_names.items()]
    if isinstance(class_names, (list, tuple)):
        return [(class_id, str(name)) for class_id, name in enumerate(class_names)]
    fail("The YOLO model did not expose readable class names.")


def canonical_class_name(name: str) -> str | None:
    normalized = normalize_class_name(name)
    for canonical, aliases in EXPECTED_CLASS_ALIASES.items():
        if normalized in aliases:
            return canonical
    return None


def build_class_mapping(class_names: Any) -> tuple[dict[int, str], dict[str, int]]:
    mapped_names: dict[int, str] = {}
    class_ids_by_name: dict[str, int] = {}

    for class_id, raw_name in iter_model_classes(class_names):
        canonical = canonical_class_name(raw_name)
        normalized = normalize_class_name(raw_name)
        mapped_names[class_id] = canonical or normalized
        if canonical and canonical not in class_ids_by_name:
            class_ids_by_name[canonical] = class_id

    missing = [name for name in ("player", "ball") if name not in class_ids_by_name]
    if missing:
        available = ", ".join(raw_name for _, raw_name in iter_model_classes(class_names)) or "none"
        fail(
            "The YOLO model is missing required classes "
            f"{missing}. Available classes: {available}. "
            "Expected aliases include player/person and ball/football."
        )

    return mapped_names, class_ids_by_name


def format_detection_counts(counts: dict[str, int]) -> str:
    ordered_names = ["player", "ball", "goalkeeper", "referee"]
    parts = [f"{name}={counts.get(name, 0)}" for name in ordered_names]
    extras = sorted(name for name in counts if name not in ordered_names)
    parts.extend(f"{name}={counts[name]}" for name in extras)
    return ", ".join(parts)


def add_detection_count(counts: dict[str, int], class_name: str) -> None:
    counts[class_name] = counts.get(class_name, 0) + 1


def get_video_info(input_path: Path, deps: dict[str, Any]) -> dict[str, Any]:
    cv2 = deps["cv2"]
    capture = cv2.VideoCapture(str(input_path))
    opened = capture.isOpened()
    log(f"Video open result: opened={opened}")
    if not opened:
        fail(f"Could not open video: {input_path}")

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 24)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    capture.release()

    if width <= 0 or height <= 0:
        fail("The input video does not expose a readable frame size.")

    max_width = int(os.environ.get("ANALYSIS_MAX_WIDTH") or 0)
    scale = 1.0
    if max_width > 0 and width > max_width:
        scale = max_width / width
    output_size = (max(2, int(round(width * scale))), max(2, int(round(height * scale))))
    log(
        "Video metadata: "
        f"fps={fps:.2f} frames={frame_count or 'unknown'} "
        f"sourceSize={width}x{height} analysisSize={output_size[0]}x{output_size[1]}"
    )
    return {
        "fps": fps,
        "frameCount": frame_count,
        "sourceSize": (width, height),
        "frameSize": output_size,
        "scale": scale,
    }


def resize_for_analysis(frame: Any, frame_size: tuple[int, int], deps: dict[str, Any]) -> Any:
    height, width = frame.shape[:2]
    target_width, target_height = frame_size
    if width == target_width and height == target_height:
        return frame
    return deps["cv2"].resize(frame, frame_size, interpolation=deps["cv2"].INTER_AREA)


def build_calibration(frame_size: tuple[int, int], deps: dict[str, Any]) -> dict[str, Any]:
    np = deps["np"]
    cv2 = deps["cv2"]
    width, height = frame_size
    source_vertices = np.array(
        [
            [0.0573 * width, 0.9583 * height],
            [0.1380 * width, 0.2546 * height],
            [0.4740 * width, 0.2407 * height],
            [0.8542 * width, 0.8472 * height],
        ],
        dtype=np.float32,
    )
    target_vertices = np.array(
        [[0, PITCH_WIDTH_METERS], [0, 0], [PITCH_LENGTH_METERS, 0], [PITCH_LENGTH_METERS, PITCH_WIDTH_METERS]],
        dtype=np.float32,
    )
    return {
        "sourceVertices": source_vertices,
        "targetVertices": target_vertices,
        "matrix": cv2.getPerspectiveTransform(source_vertices, target_vertices),
        "calibrationStatus": "default_homography",
        "pitch": {"lengthMeters": PITCH_LENGTH_METERS, "widthMeters": PITCH_WIDTH_METERS},
    }


def transform_position(position: Any, calibration: dict[str, Any], deps: dict[str, Any]) -> list[float] | None:
    cv2 = deps["cv2"]
    np = deps["np"]
    source_vertices = calibration["sourceVertices"]
    point = (float(position[0]), float(position[1]))
    if cv2.pointPolygonTest(source_vertices, point, False) < 0:
        return None

    reshaped = np.array(point, dtype=np.float32).reshape(-1, 1, 2)
    transformed = cv2.perspectiveTransform(reshaped, calibration["matrix"])
    x, y = transformed.reshape(-1, 2).squeeze().tolist()
    if not (0 <= x <= PITCH_LENGTH_METERS and 0 <= y <= PITCH_WIDTH_METERS):
        return None
    return [float(x), float(y)]


class CameraMovementEstimator:
    def __init__(self, first_frame: Any, deps: dict[str, Any]) -> None:
        self.cv2 = deps["cv2"]
        self.np = deps["np"]
        height, width = first_frame.shape[:2]
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
        new_features, status, _error = self.cv2.calcOpticalFlowPyrLK(
            self.old_gray, frame_gray, self.old_features, None, **self.lk_params
        )
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


class TeamAssigner:
    def __init__(self, kmeans_cls: Any) -> None:
        self.kmeans_cls = kmeans_cls
        self.kmeans = None
        self.team_colors: dict[int, Any] = {}
        self.player_team: dict[int, int] = {}

    def get_player_color(self, frame: Any, bbox: list[float]) -> Any | None:
        height, width = frame.shape[:2]
        x1 = max(0, min(width - 1, int(bbox[0])))
        y1 = max(0, min(height - 1, int(bbox[1])))
        x2 = max(0, min(width, int(bbox[2])))
        y2 = max(0, min(height, int(bbox[3])))
        if x2 <= x1 or y2 <= y1:
            return None
        image = frame[y1:y2, x1:x2]
        if image.size == 0:
            return None
        top_half = image[: max(1, image.shape[0] // 2), :]
        image_2d = top_half.reshape(-1, 3)
        if len(image_2d) < 2:
            return None
        kmeans = self.kmeans_cls(n_clusters=2, init="k-means++", n_init=1)
        kmeans.fit(image_2d)
        labels = kmeans.labels_.reshape(top_half.shape[0], top_half.shape[1])
        corner_clusters = [labels[0, 0], labels[0, -1], labels[-1, 0], labels[-1, -1]]
        non_player_cluster = max(set(corner_clusters), key=corner_clusters.count)
        player_cluster = 1 - int(non_player_cluster)
        return kmeans.cluster_centers_[player_cluster]

    def assign_team_colors(self, frame: Any, player_tracks: dict[int, dict[str, Any]]) -> None:
        player_colors = []
        for player in player_tracks.values():
            color = self.get_player_color(frame, player["bbox"])
            if color is not None:
                player_colors.append(color)
        if len(player_colors) < 2:
            return
        self.kmeans = self.kmeans_cls(n_clusters=2, init="k-means++", n_init=10)
        self.kmeans.fit(player_colors)
        self.team_colors[1] = self.kmeans.cluster_centers_[0]
        self.team_colors[2] = self.kmeans.cluster_centers_[1]
        log("Team color calibration ready")

    def get_player_team(self, frame: Any, bbox: list[float], player_id: int) -> int:
        if player_id in self.player_team:
            return self.player_team[player_id]
        if self.kmeans is None:
            return 1
        color = self.get_player_color(frame, bbox)
        if color is None:
            return 1
        team = int(self.kmeans.predict(color.reshape(1, -1))[0]) + 1
        self.player_team[player_id] = team
        return team


def process_video_pass(
    input_path: Path,
    model_path: Path,
    video_info: dict[str, Any],
    calibration: dict[str, Any],
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

    tracker = sv.ByteTrack()
    assigner = TeamAssigner(deps["KMeans"])
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

        if getattr(detections, "class_id", None) is not None and "goalkeeper" in class_ids_by_name:
            player_id = class_ids_by_name.get("player")
            goalkeeper_id = class_ids_by_name.get("goalkeeper")
            if player_id is not None and goalkeeper_id is not None:
                detections.class_id = np.array(
                    [player_id if int(class_id) == goalkeeper_id else int(class_id) for class_id in detections.class_id]
                )

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

        if assigner.kmeans is None and len(frame_players) >= 2:
            assigner.assign_team_colors(frame, frame_players)
        for player_id, player in frame_players.items():
            team = assigner.get_player_team(frame, player["bbox"], player_id)
            player["team"] = team
            team_color = assigner.team_colors.get(team)
            player["team_color"] = tuple(int(channel) for channel in team_color) if team_color is not None else None

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
    return {"tracks": tracks, "frameCount": frame_num}


def assign_ball_control(tracks: dict[str, list[dict[int, dict[str, Any]]]], frame_size: tuple[int, int]) -> list[int]:
    width, height = frame_size
    max_distance = max(width, height) * 0.04
    control: list[int] = []
    last_team = 0
    for frame_num, player_tracks in enumerate(tracks["players"]):
        ball = tracks["ball"][frame_num].get(1)
        assigned_player = -1
        nearest_distance = float("inf")
        if ball:
            ball_position = center_of_bbox(ball["bbox"])
            for player_id, player in player_tracks.items():
                bbox = player["bbox"]
                distance = min(
                    measure_distance((bbox[0], bbox[3]), ball_position),
                    measure_distance((bbox[2], bbox[3]), ball_position),
                )
                if distance < max_distance and distance < nearest_distance:
                    nearest_distance = distance
                    assigned_player = player_id
        if assigned_player != -1:
            player_tracks[assigned_player]["has_ball"] = True
            last_team = int(player_tracks[assigned_player].get("team", 0))
        control.append(last_team)
    return control


def add_rejection(quality: dict[str, Any], reason: str) -> None:
    quality["rejectedSamples"] += 1
    quality["rejectionReasons"][reason] = quality["rejectionReasons"].get(reason, 0) + 1


def is_inside_pitch(point: Any) -> bool:
    return (
        point is not None
        and 0 <= float(point[0]) <= PITCH_LENGTH_METERS
        and 0 <= float(point[1]) <= PITCH_WIDTH_METERS
    )


def add_speed_and_distance(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    fps: float,
    calibration: dict[str, Any],
) -> dict[str, Any]:
    players = tracks["players"]
    player_distance: dict[int, float] = {}
    previous_speed: dict[int, float] = {}
    player_valid_samples: dict[int, int] = {}
    quality: dict[str, Any] = {
        "validSamples": 0,
        "rejectedSamples": 0,
        "rejectionReasons": {},
        "calibrationStatus": calibration["calibrationStatus"],
        "players": player_valid_samples,
    }

    for frame_num in range(0, len(players), SPEED_WINDOW_FRAMES):
        last_frame = min(frame_num + SPEED_WINDOW_FRAMES, len(players) - 1)
        elapsed = (last_frame - frame_num) / (fps or 24)
        if elapsed <= 0:
            continue

        for track_id in players[frame_num].keys():
            if track_id not in players[last_frame]:
                add_rejection(quality, "missing_endpoint")
                continue
            if any(track_id not in players[index] for index in range(frame_num, last_frame + 1)):
                add_rejection(quality, "track_gap")
                continue

            start = players[frame_num][track_id].get("position_transformed")
            end = players[last_frame][track_id].get("position_transformed")
            if not is_inside_pitch(start) or not is_inside_pitch(end):
                add_rejection(quality, "outside_pitch")
                continue

            distance = measure_distance(start, end)
            speed_kmh = (distance / elapsed) * 3.6
            if speed_kmh > MAX_VALID_SAMPLE_KMH:
                add_rejection(quality, "implausible_track_jump")
                continue

            previous = previous_speed.get(track_id)
            if previous is not None and abs(speed_kmh - previous) > MAX_SPEED_DELTA_KMH:
                add_rejection(quality, "acceleration_jump")
                continue

            previous_speed[track_id] = speed_kmh
            player_distance[track_id] = player_distance.get(track_id, 0.0) + distance
            player_valid_samples[track_id] = player_valid_samples.get(track_id, 0) + 1
            quality["validSamples"] += 1

            for batch_frame_num in range(frame_num, last_frame + 1):
                if track_id in players[batch_frame_num]:
                    players[batch_frame_num][track_id]["speed"] = speed_kmh
                    players[batch_frame_num][track_id]["distance"] = player_distance[track_id]
                    players[batch_frame_num][track_id]["valid_speed_sample"] = True

    return quality


def build_possession_series(control: list[int]) -> list[tuple[float, float]]:
    team1 = 0
    team2 = 0
    known = 0
    series: list[tuple[float, float]] = []
    for team in control:
        if team in (1, 2):
            known += 1
            if team == 1:
                team1 += 1
            else:
                team2 += 1
        series.append(((team1 / known) * 100 if known else 0.0, (team2 / known) * 100 if known else 0.0))
    return series


def draw_label(cv2: Any, canvas: Any, text: str, origin: tuple[int, int], color: tuple[int, int, int]) -> None:
    x, y = origin
    (label_width, label_height), _baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.44, 1)
    cv2.rectangle(canvas, (x, y - label_height - 8), (x + label_width + 10, y + 4), color, cv2.FILLED)
    cv2.putText(canvas, text, (x + 5, y - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.44, (0, 0, 0), 1, cv2.LINE_AA)


def annotate_frame(
    frame: Any,
    frame_num: int,
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    possession_series: list[tuple[float, float]],
    deps: dict[str, Any],
) -> Any:
    cv2 = deps["cv2"]
    np = deps["np"]
    canvas = frame.copy()
    height, width = canvas.shape[:2]
    total_frames = max(1, len(tracks["players"]))
    team1, team2 = possession_series[min(frame_num, len(possession_series) - 1)] if possession_series else (0.0, 0.0)
    orange = (43, 107, 255)
    white = (235, 235, 235)
    gray = (155, 155, 155)
    green = (80, 255, 80)
    cyan = (255, 180, 40)

    overlay = canvas.copy()
    cv2.rectangle(overlay, (18, 18), (min(width - 18, 520), 132), (5, 5, 5), -1)
    cv2.addWeighted(overlay, 0.62, canvas, 0.38, 0, canvas)
    cv2.putText(canvas, "DRIVXIS ANALISIS", (34, 50), cv2.FONT_HERSHEY_SIMPLEX, 0.64, orange, 2, cv2.LINE_AA)
    cv2.putText(canvas, f"EQ1 {team1:05.1f}%  EQ2 {team2:05.1f}%", (34, 82), cv2.FONT_HERSHEY_SIMPLEX, 0.56, white, 1, cv2.LINE_AA)
    cv2.putText(
        canvas,
        f"FRAME {frame_num + 1}/{total_frames}",
        (34, 112),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        gray,
        1,
        cv2.LINE_AA,
    )

    bar_width = min(width - 70, 420)
    progress = (frame_num + 1) / total_frames
    cv2.rectangle(canvas, (34, 120), (34 + bar_width, 124), (42, 42, 42), -1)
    cv2.rectangle(canvas, (34, 120), (34 + int(bar_width * progress), 124), orange, -1)

    players = tracks["players"][frame_num] if frame_num < len(tracks["players"]) else {}
    for player_id, player in players.items():
        x1, y1, x2, y2 = [int(value) for value in player["bbox"]]
        team = int(player.get("team", 1))
        color = orange if team == 1 else white
        cv2.rectangle(canvas, (x1, y1), (x2, y2), color, 2)
        draw_label(cv2, canvas, f"#{player_id}", (x1, max(18, y1)), color)
        if player.get("has_ball"):
            triangle = np.array([[int((x1 + x2) / 2), y1 - 4], [int((x1 + x2) / 2) - 10, y1 - 24], [int((x1 + x2) / 2) + 10, y1 - 24]])
            cv2.drawContours(canvas, [triangle], 0, orange, cv2.FILLED)
        if "speed" in player:
            cv2.putText(
                canvas,
                f"{float(player['speed']):.1f} km/h",
                (x1, min(height - 10, y2 + 18)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.42,
                white,
                1,
                cv2.LINE_AA,
            )

    referees = tracks["referees"][frame_num] if frame_num < len(tracks["referees"]) else {}
    for referee_id, referee in referees.items():
        x1, y1, x2, y2 = [int(value) for value in referee["bbox"]]
        cv2.rectangle(canvas, (x1, y1), (x2, y2), cyan, 2)
        draw_label(cv2, canvas, f"REF {referee_id}", (x1, max(18, y1)), cyan)

    balls = tracks["ball"][frame_num] if frame_num < len(tracks["ball"]) else {}
    for ball in balls.values():
        x, y = center_of_bbox(ball["bbox"])
        cv2.circle(canvas, (x, y), 7, green, 2)
        cv2.circle(canvas, (x, y), 2, green, cv2.FILLED)

    return canvas


def write_processed_video(
    input_path: Path,
    output_path: Path,
    video_info: dict[str, Any],
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    control: list[int],
    deps: dict[str, Any],
) -> None:
    cv2 = deps["cv2"]
    imageio_ffmpeg = deps["imageio_ffmpeg"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    frame_size = video_info["frameSize"]
    fps = float(video_info["fps"] or 24)
    width, height = frame_size
    possession_series = build_possession_series(control)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    command = [
        ffmpeg_exe,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "bgr24",
        "-s",
        f"{width}x{height}",
        "-r",
        f"{fps:.3f}",
        "-i",
        "-",
        "-an",
        "-vcodec",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    log(f"Writing browser-compatible processed video: {output_path}")
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if process.stdin is None:
        fail("Could not open ffmpeg stdin.")

    capture = cv2.VideoCapture(str(input_path))
    if not capture.isOpened():
        fail(f"Could not reopen video for processed output: {input_path}")

    frame_num = 0
    try:
        while True:
            ok, source_frame = capture.read()
            if not ok or frame_num >= len(tracks["players"]):
                break
            frame = resize_for_analysis(source_frame, frame_size, deps)
            canvas = annotate_frame(frame, frame_num, tracks, possession_series, deps)
            process.stdin.write(canvas.tobytes())
            frame_num += 1
            if frame_num % 30 == 0:
                log_progress(82 + round((frame_num / max(1, len(tracks["players"]))) * 14), "writing processed video")
            del source_frame
            del frame
            del canvas
    except BrokenPipeError:
        stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
        fail(f"ffmpeg stopped while writing processed video. {stderr}")
    finally:
        capture.release()
        process.stdin.close()

    stdout = process.stdout.read().decode("utf-8", errors="replace") if process.stdout else ""
    stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
    return_code = process.wait()
    if return_code != 0:
        details = "\n".join(part for part in (stdout.strip(), stderr.strip()) if part)
        fail(f"ffmpeg failed to encode processed video with code {return_code}. {details}")

    log(f"Processed video written: {output_path} frames={frame_num} codec=h264 pix_fmt=yuv420p")


def build_metrics(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    control: list[int],
    fps: float,
    speed_quality: dict[str, Any],
) -> dict[str, Any]:
    known_control = [team for team in control if team in (1, 2)]
    team1_pct = known_control.count(1) / len(known_control) * 100 if known_control else 0
    team2_pct = known_control.count(2) / len(known_control) * 100 if known_control else 0
    unknown_pct = 100 - team1_pct - team2_pct if control else 100

    player_accumulator: dict[int, dict[str, Any]] = {}
    all_speeds: list[float] = []
    for frame_tracks in tracks["players"]:
        for player_id, player in frame_tracks.items():
            item = player_accumulator.setdefault(
                player_id,
                {"id": player_id, "team": player.get("team"), "speeds": [], "distanceMeters": 0.0},
            )
            if player.get("team") in (1, 2):
                item["team"] = player.get("team")
            if "speed" in player:
                speed = float(player["speed"])
                item["speeds"].append(speed)
                all_speeds.append(speed)
            if "distance" in player:
                item["distanceMeters"] = max(float(item["distanceMeters"]), float(player["distance"]))

    per_player_valid = speed_quality.get("players", {})
    players = []
    for player_id, item in player_accumulator.items():
        speeds = item.pop("speeds")
        item["maxKmh"] = max(speeds) if speeds else 0
        item["avgKmh"] = sum(speeds) / len(speeds) if speeds else 0
        item["validSamples"] = int(per_player_valid.get(player_id, 0))
        players.append(item)
    players.sort(key=lambda player: (player["maxKmh"], player["validSamples"]), reverse=True)

    total_distance = sum(float(player["distanceMeters"]) for player in players)
    return {
        "version": 1,
        "source": "football_analysis",
        "possession": {
            "team1Pct": round(team1_pct, 2),
            "team2Pct": round(team2_pct, 2),
            "unknownPct": round(max(0, unknown_pct), 2),
        },
        "speed": {
            "maxKmh": round(max(all_speeds), 2) if all_speeds else 0,
            "avgKmh": round(sum(all_speeds) / len(all_speeds), 2) if all_speeds else 0,
            "validSamples": int(speed_quality["validSamples"]),
            "rejectedSamples": int(speed_quality["rejectedSamples"]),
            "rejectionReasons": speed_quality["rejectionReasons"],
            "calibrationStatus": speed_quality["calibrationStatus"],
            "players": [
                {
                    "id": player["id"],
                    "team": player.get("team"),
                    "maxKmh": round(player["maxKmh"], 2),
                    "avgKmh": round(player["avgKmh"], 2),
                    "distanceMeters": round(player["distanceMeters"], 2),
                    "validSamples": int(player["validSamples"]),
                }
                for player in players[:22]
            ],
        },
        "distance": {
            "totalMeters": round(total_distance, 2),
        },
        "video": {
            "frameCount": len(tracks["players"]),
            "fps": round(float(fps), 2),
            "durationSeconds": round(len(tracks["players"]) / (fps or 24), 2),
            "annotatedAvailable": True,
            "processedAvailable": True,
        },
    }


def run(input_path: Path, output_path: Path, metrics_path: Path, model_path: Path) -> None:
    log("Starting football analysis")
    log(f"Input={input_path}")
    log(f"Output={output_path}")
    log(f"Metrics={metrics_path}")
    log(f"Model={model_path}")
    if not input_path.exists():
        fail(f"Input video does not exist: {input_path}")
    if not model_path.exists():
        fail(f"Missing YOLO model at {model_path}. Download best.pt into analysis/models/best.pt")

    deps = load_runtime_dependencies()
    log("Runtime dependencies loaded")
    log_progress(8, "opening video")
    video_info = get_video_info(input_path, deps)
    calibration = build_calibration(video_info["frameSize"], deps)
    log(f"Calibration: {json.dumps({'status': calibration['calibrationStatus'], 'pitch': calibration['pitch']})}")
    log_progress(12, "loading model")

    analysis = process_video_pass(input_path, model_path, video_info, calibration, deps)
    tracks = analysis["tracks"]

    log("Assigning ball control")
    log_progress(72, "assigning possession")
    ball_control = assign_ball_control(tracks, video_info["frameSize"])

    log("Calculating speed and distance without clamping")
    log_progress(76, "calculating metrics")
    speed_quality = add_speed_and_distance(tracks, float(video_info["fps"]), calibration)
    log(
        "Speed quality: "
        f"valid={speed_quality['validSamples']} "
        f"rejected={speed_quality['rejectedSamples']} "
        f"reasons={speed_quality['rejectionReasons']}"
    )

    log_progress(82, "writing processed video")
    write_processed_video(input_path, output_path, video_info, tracks, ball_control, deps)

    log_progress(97, "writing metrics")
    metrics = build_metrics(tracks, ball_control, float(video_info["fps"]), speed_quality)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    log(
        "Metrics written: "
        f"players={len(metrics['speed']['players'])} "
        f"frames={metrics['video']['frameCount']} "
        f"maxKmh={metrics['speed']['maxKmh']} "
        f"avgKmh={metrics['speed']['avgKmh']} "
        f"validSamples={metrics['speed']['validSamples']} "
        f"rejectedSamples={metrics['speed']['rejectedSamples']} "
        f"distanceMeters={metrics['distance']['totalMeters']}"
    )
    log("Analysis completed successfully")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run DRIVXIS football video analysis.")
    parser.add_argument("--input", required=True, type=Path, help="Source video path.")
    parser.add_argument("--output", required=True, type=Path, help="Processed H.264 MP4 output path.")
    parser.add_argument("--metrics-json", required=True, type=Path, help="Metrics JSON output path.")
    parser.add_argument("--model", required=True, type=Path, help="YOLO model path.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(args.input, args.output, args.metrics_json, args.model)
