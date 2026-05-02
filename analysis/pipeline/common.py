from __future__ import annotations

import json
import math
import os
import re
import sys
from pathlib import Path
from typing import Any

PITCH_LENGTH_METERS = 105.0
PITCH_WIDTH_METERS = 68.0
SPEED_WINDOW_FRAMES = 5
SHORT_GAP_INTERPOLATION_FRAMES = 5
REID_MAX_GAP_FRAMES = 45
BALL_INTERPOLATION_FRAMES = 8
BALL_CONTROL_MEMORY_FRAMES = 12
MIN_TRUSTED_SPEED_SAMPLES = 5
HUMAN_MAX_SPEED_KMH = 38.0
DEFAULT_TEAM_COLORS_BGR = {
    1: (43, 107, 255),
    2: (235, 235, 235),
}
EXPECTED_CLASS_ALIASES = {
    "player": {"player", "players", "person"},
    "goalkeeper": {"goalkeeper", "goalie", "keeper", "gk"},
    "referee": {"referee", "ref", "official"},
    "ball": {"ball", "football", "soccer_ball", "soccer-ball"},
}


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
        fail("Missing Python dependency " f"'{error.name}'. Run: pip install -r analysis/requirements.txt")

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


def bbox_width(bbox: list[float]) -> float:
    return abs(float(bbox[2]) - float(bbox[0]))


def bbox_height(bbox: list[float]) -> float:
    return abs(float(bbox[3]) - float(bbox[1]))


def bbox_iou(first: Any, second: Any) -> float:
    if first is None or second is None:
        return 0.0
    ax1, ay1, ax2, ay2 = [float(value) for value in first[:4]]
    bx1, by1, bx2, by2 = [float(value) for value in second[:4]]
    overlap_x1 = max(ax1, bx1)
    overlap_y1 = max(ay1, by1)
    overlap_x2 = min(ax2, bx2)
    overlap_y2 = min(ay2, by2)
    overlap_width = max(0.0, overlap_x2 - overlap_x1)
    overlap_height = max(0.0, overlap_y2 - overlap_y1)
    intersection = overlap_width * overlap_height
    first_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    second_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = first_area + second_area - intersection
    return intersection / union if union > 0 else 0.0


def measure_distance(p1: Any, p2: Any) -> float:
    return math.sqrt((float(p1[0]) - float(p2[0])) ** 2 + (float(p1[1]) - float(p2[1])) ** 2)


def median(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    midpoint = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[midpoint]
    return (ordered[midpoint - 1] + ordered[midpoint]) / 2


def detection_arrays(detections: Any) -> tuple[Any, Any, Any]:
    xyxy = getattr(detections, "xyxy", [])
    class_id = getattr(detections, "class_id", [])
    tracker_id = getattr(detections, "tracker_id", None)
    return xyxy, class_id, tracker_id


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


def hex_to_bgr(value: Any) -> tuple[int, int, int] | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lstrip("#")
    if len(normalized) != 6:
        return None
    try:
        red = int(normalized[0:2], 16)
        green = int(normalized[2:4], 16)
        blue = int(normalized[4:6], 16)
    except ValueError:
        return None
    return (blue, green, red)


def bgr_to_hex(value: Any) -> str | None:
    if value is None:
        return None
    try:
        blue, green, red = [max(0, min(255, int(round(float(channel))))) for channel in value[:3]]
    except (TypeError, ValueError, IndexError):
        return None
    return f"#{red:02x}{green:02x}{blue:02x}"


def parse_match_info(raw_value: str | None) -> dict[str, Any]:
    if not raw_value:
        return {}
    try:
        payload = json.loads(raw_value)
    except json.JSONDecodeError:
        try:
            payload = json.loads(raw_value.replace('\\"', '"'))
        except json.JSONDecodeError:
            log("Match info ignored because JSON was invalid")
            return {}
    return payload if isinstance(payload, dict) else {}


def build_color_anchors(match_info: dict[str, Any]) -> dict[int, Any]:
    anchors: dict[int, Any] = {}
    own_color = hex_to_bgr(match_info.get("ownTeamColor"))
    rival_color = hex_to_bgr(match_info.get("rivalTeamColor"))
    if own_color:
        anchors[1] = own_color
    if rival_color:
        anchors[2] = rival_color
    return anchors
