from __future__ import annotations

from typing import Any

from .common import PITCH_LENGTH_METERS, PITCH_WIDTH_METERS


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
    polygon_area = float(cv2.contourArea(source_vertices))
    frame_area = float(width * height)
    coverage = polygon_area / frame_area if frame_area else 0.0
    return {
        "sourceVertices": source_vertices,
        "targetVertices": target_vertices,
        "matrix": cv2.getPerspectiveTransform(source_vertices, target_vertices),
        "calibrationStatus": "default_homography",
        "confidence": max(0.15, min(0.55, coverage)),
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


def is_inside_pitch(point: Any) -> bool:
    return (
        point is not None
        and 0 <= float(point[0]) <= PITCH_LENGTH_METERS
        and 0 <= float(point[1]) <= PITCH_WIDTH_METERS
    )
