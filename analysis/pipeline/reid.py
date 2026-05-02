from __future__ import annotations

from typing import Any

from .ball import interpolate_list, interpolate_optional_point, tracking_position
from .calibration import is_inside_pitch
from .common import REID_MAX_GAP_FRAMES, SHORT_GAP_INTERPOLATION_FRAMES, bbox_height, bbox_width, foot_position, measure_distance


def assign_stable_player_ids(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    fps: float,
    frame_size: tuple[int, int],
) -> dict[str, Any]:
    max_gap = max(REID_MAX_GAP_FRAMES, int(round((fps or 24) * 1.5)))
    max_frame_span = max(frame_size)
    source_to_stable: dict[int, int] = {}
    stable_last_seen: dict[int, dict[str, Any]] = {}
    next_stable_id = 1
    remapped_sources = 0
    duplicate_collisions = 0

    for frame_num, frame_players in enumerate(tracks["players"]):
        next_frame_players: dict[int, dict[str, Any]] = {}
        used_stable_ids: set[int] = set()

        for source_id, player in sorted(frame_players.items(), key=lambda item: item[0]):
            stable_id = source_to_stable.get(source_id)
            if stable_id is None:
                stable_id = find_reidentification_match(player, frame_num, stable_last_seen, used_stable_ids, max_gap, max_frame_span, fps)
                if stable_id is None:
                    stable_id = next_stable_id
                    next_stable_id += 1
                else:
                    remapped_sources += 1
                source_to_stable[source_id] = stable_id

            if stable_id in used_stable_ids:
                duplicate_collisions += 1
                stable_id = next_stable_id
                next_stable_id += 1
                source_to_stable[source_id] = stable_id

            mapped_player = dict(player)
            mapped_player["source_track_id"] = source_id
            mapped_player["display_id"] = stable_id
            next_frame_players[stable_id] = mapped_player
            used_stable_ids.add(stable_id)
            stable_last_seen[stable_id] = {
                "frame": frame_num,
                "position": tracking_position(mapped_player),
                "bbox": mapped_player.get("bbox"),
                "team": mapped_player.get("team"),
            }

        tracks["players"][frame_num] = next_frame_players

    interpolate_short_player_gaps(tracks, SHORT_GAP_INTERPOLATION_FRAMES)
    display_players = next_stable_id - 1
    source_tracks = len(source_to_stable)
    fragmentation_ratio = round(display_players / max(1, min(22, source_tracks)), 3)
    confidence = max(0.0, min(1.0, 1.0 - max(0.0, fragmentation_ratio - 1.15) / 1.5))
    return {
        "displayPlayers": display_players,
        "sourceTracks": source_tracks,
        "remappedSources": remapped_sources,
        "duplicateCollisions": duplicate_collisions,
        "fragmentationRatio": fragmentation_ratio,
        "confidence": round(confidence, 3),
        "lowConfidence": confidence < 0.55 or display_players > 28,
    }


def find_reidentification_match(
    player: dict[str, Any],
    frame_num: int,
    stable_last_seen: dict[int, dict[str, Any]],
    used_stable_ids: set[int],
    max_gap: int,
    max_frame_span: int,
    fps: float,
) -> int | None:
    position = tracking_position(player)
    bbox = player.get("bbox")
    team = player.get("team")
    best_id = None
    best_score = float("inf")

    for stable_id, previous in stable_last_seen.items():
        if stable_id in used_stable_ids:
            continue
        gap = frame_num - int(previous["frame"])
        if gap <= 0 or gap > max_gap:
            continue
        if team in (1, 2) and previous.get("team") in (1, 2) and team != previous.get("team"):
            continue

        distance = comparable_position_distance(position, previous.get("position"), bbox, previous.get("bbox"))
        if distance is None:
            continue

        seconds = gap / (fps or 24)
        if is_inside_pitch(position) and is_inside_pitch(previous.get("position")):
            dynamic_limit = max(2.5, 7.2 * seconds)
            score = distance + gap * 0.08
        else:
            size_penalty = bbox_similarity_penalty(bbox, previous.get("bbox"))
            dynamic_limit = max(32.0, max_frame_span * 0.055)
            score = distance + size_penalty + gap * 0.4
        if distance <= dynamic_limit and score < best_score:
            best_score = score
            best_id = stable_id

    return best_id


def comparable_position_distance(current: Any, previous: Any, current_bbox: Any, previous_bbox: Any) -> float | None:
    if current is not None and previous is not None:
        return measure_distance(current, previous)
    if current_bbox is None or previous_bbox is None:
        return None
    return measure_distance(foot_position(current_bbox), foot_position(previous_bbox))


def bbox_similarity_penalty(current_bbox: Any, previous_bbox: Any) -> float:
    if current_bbox is None or previous_bbox is None:
        return 20.0
    width_delta = abs(bbox_width(current_bbox) - bbox_width(previous_bbox))
    height_delta = abs(bbox_height(current_bbox) - bbox_height(previous_bbox))
    return min(45.0, width_delta * 0.4 + height_delta * 0.3)


def interpolate_short_player_gaps(tracks: dict[str, list[dict[int, dict[str, Any]]]], max_gap: int) -> None:
    players = tracks["players"]
    appearances: dict[int, list[int]] = {}
    for frame_num, frame_players in enumerate(players):
        for player_id in frame_players:
            appearances.setdefault(player_id, []).append(frame_num)

    for player_id, frames in appearances.items():
        for left, right in zip(frames, frames[1:]):
            gap = right - left - 1
            if gap <= 0 or gap > max_gap:
                continue
            start = players[left][player_id]
            end = players[right][player_id]
            if "bbox" not in start or "bbox" not in end:
                continue
            for offset, frame_num in enumerate(range(left + 1, right), start=1):
                if player_id in players[frame_num]:
                    continue
                ratio = offset / (gap + 1)
                interpolated = dict(start)
                interpolated["bbox"] = interpolate_list(start["bbox"], end["bbox"], ratio)
                interpolated["position"] = foot_position(interpolated["bbox"])
                interpolated["position_adjusted"] = interpolate_optional_point(start.get("position_adjusted"), end.get("position_adjusted"), ratio)
                interpolated["position_transformed"] = interpolate_optional_point(start.get("position_transformed"), end.get("position_transformed"), ratio)
                interpolated["interpolated"] = True
                players[frame_num][player_id] = interpolated
