from __future__ import annotations

from typing import Any

from .common import (
    BALL_CONTROL_MEMORY_FRAMES,
    BALL_INTERPOLATION_FRAMES,
    center_of_bbox,
    foot_position,
    measure_distance,
)


def tracking_position(track_info: dict[str, Any]) -> Any:
    transformed = track_info.get("position_transformed")
    if transformed is not None:
        return transformed
    adjusted = track_info.get("position_adjusted")
    if adjusted is not None:
        return adjusted
    bbox = track_info.get("bbox")
    return foot_position(bbox) if bbox else None


def interpolate_ball_positions(tracks: dict[str, list[dict[int, dict[str, Any]]]], max_gap: int = BALL_INTERPOLATION_FRAMES) -> dict[str, Any]:
    ball_frames = tracks["ball"]
    detections = [index for index, frame_ball in enumerate(ball_frames) if 1 in frame_ball]
    filled = 0
    if not detections:
        return {"interpolatedFrames": 0, "detectedFrames": 0, "confidence": 0.0}

    for left, right in zip(detections, detections[1:]):
        gap = right - left - 1
        if gap <= 0 or gap > max_gap:
            continue
        start = ball_frames[left][1]
        end = ball_frames[right][1]
        if "bbox" not in start or "bbox" not in end:
            continue
        for offset, frame_num in enumerate(range(left + 1, right), start=1):
            ratio = offset / (gap + 1)
            interpolated = dict(start)
            interpolated["bbox"] = interpolate_list(start["bbox"], end["bbox"], ratio)
            interpolated["position"] = center_of_bbox(interpolated["bbox"])
            interpolated["position_adjusted"] = interpolate_optional_point(start.get("position_adjusted"), end.get("position_adjusted"), ratio)
            interpolated["position_transformed"] = interpolate_optional_point(start.get("position_transformed"), end.get("position_transformed"), ratio)
            interpolated["interpolated"] = True
            ball_frames[frame_num][1] = interpolated
            filled += 1

    detected_or_filled = sum(1 for frame_ball in ball_frames if 1 in frame_ball)
    return {
        "interpolatedFrames": filled,
        "detectedFrames": len(detections),
        "confidence": round(detected_or_filled / max(1, len(ball_frames)), 3),
    }


def assign_ball_control(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    frame_size: tuple[int, int],
    max_memory_frames: int = BALL_CONTROL_MEMORY_FRAMES,
) -> tuple[list[int], dict[str, Any]]:
    width, height = frame_size
    max_distance = max(55.0, min(82.0, max(width, height) * 0.055))
    control: list[int] = []
    last_team = 0
    frames_since_seen = max_memory_frames + 1
    direct_assignments = 0
    carried_assignments = 0
    unknown_frames = 0
    nearest_distances: list[float] = []

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
            player_tracks[assigned_player]["ball_distance"] = round(float(nearest_distance), 2)
            last_team = int(player_tracks[assigned_player].get("team", 0))
            frames_since_seen = 0
            direct_assignments += 1
            nearest_distances.append(float(nearest_distance))
            control.append(last_team)
            continue

        frames_since_seen += 1
        if last_team in (1, 2) and frames_since_seen <= max_memory_frames:
            carried_assignments += 1
            control.append(last_team)
        else:
            unknown_frames += 1
            control.append(0)

    return control, {
        "directAssignments": direct_assignments,
        "carriedAssignments": carried_assignments,
        "unknownFrames": unknown_frames,
        "memoryFrames": max_memory_frames,
        "maxPlayerBallDistance": round(max_distance, 2),
        "avgAssignmentDistance": round(sum(nearest_distances) / len(nearest_distances), 2) if nearest_distances else 0,
    }


def interpolate_list(start: list[float], end: list[float], ratio: float) -> list[float]:
    return [float(start_value) + (float(end_value) - float(start_value)) * ratio for start_value, end_value in zip(start, end)]


def interpolate_optional_point(start: Any, end: Any, ratio: float) -> list[float] | None:
    if start is None or end is None:
        return None
    return interpolate_list(list(start), list(end), ratio)
