from __future__ import annotations

from collections import defaultdict
from typing import Any

from .common import DEFAULT_TEAM_COLORS_BGR, median


GOALKEEPER_KIT_TO_FIELD_KIT = {
    "black": "white",
    "orange": "green",
}
FIELD_KIT_REFERENCE_BGR = {
    "white": (235.0, 235.0, 235.0),
    "green": (130.0, 220.0, 145.0),
}
DEFAULT_GOALKEEPER_TEAMS = {
    "black": 2,
    "orange": 1,
}


def detect_hardcoded_goalkeeper_kit(frame: Any, bbox: list[float], np: Any) -> str | None:
    """Match this video's black and orange goalkeeper shirts from torso pixels."""
    if frame is None or not hasattr(frame, "shape") or len(bbox) < 4:
        return None

    frame_height, frame_width = frame.shape[:2]
    x1, y1, x2, y2 = (float(value) for value in bbox[:4])
    box_width = max(1.0, x2 - x1)
    box_height = max(1.0, y2 - y1)
    crop_x1 = max(0, min(frame_width, int(round(x1 + box_width * 0.18))))
    crop_x2 = max(0, min(frame_width, int(round(x1 + box_width * 0.82))))
    crop_y1 = max(0, min(frame_height, int(round(y1 + box_height * 0.12))))
    crop_y2 = max(0, min(frame_height, int(round(y1 + box_height * 0.58))))
    if crop_x2 <= crop_x1 or crop_y2 <= crop_y1:
        return None

    crop = frame[crop_y1:crop_y2, crop_x1:crop_x2]
    if getattr(crop, "size", 0) == 0:
        return None
    pixels = crop.astype(float)
    blue = pixels[:, :, 0]
    green = pixels[:, :, 1]
    red = pixels[:, :, 2]
    brightest = np.maximum.reduce([blue, green, red])

    dark_pixels = (brightest <= 105.0) & (green <= np.maximum(red, blue) * 1.35 + 12.0)
    orange_pixels = (
        (red >= 125.0)
        & (red >= green * 1.22 + 15.0)
        & (red >= blue * 1.35 + 20.0)
    )
    dark_ratio = float(np.mean(dark_pixels))
    orange_ratio = float(np.mean(orange_pixels))
    if orange_ratio >= 0.28:
        return "orange"
    if dark_ratio >= 0.34:
        return "black"
    return None


def classify_hardcoded_goalkeeper_color(color: Any) -> str | None:
    """Fallback for tests and non-video callers that already provide a BGR color."""
    if not isinstance(color, (list, tuple)) or len(color) < 3:
        return None
    try:
        blue, green, red = (float(channel) for channel in color[:3])
    except (TypeError, ValueError):
        return None
    if red >= 150.0 and red >= green * 1.22 + 15.0 and red >= blue * 1.35 + 20.0:
        return "orange"
    if max(blue, green, red) <= 105.0 and green <= max(red, blue) * 1.35 + 12.0:
        return "black"
    return None


def assign_goalkeeper_teams(tracks: dict[str, list[dict[int, dict[str, Any]]]]) -> dict[str, Any]:
    observations = collect_player_observations(tracks)
    goalkeeper_candidates = score_goalkeeper_candidates(observations)
    goalkeeper_candidates = retain_persistent_goalkeeper_candidates(
        goalkeeper_candidates,
        len(tracks["players"]),
    )
    team_positions: dict[int, list[float]] = {1: [], 2: []}
    team_colors = representative_team_colors(tracks, goalkeeper_candidates)

    for frame_players in tracks["players"]:
        for player_id, player in frame_players.items():
            team = player.get("team")
            transformed = player.get("position_transformed")
            adjusted = player.get("position_adjusted")
            x_position = transformed[0] if transformed is not None else adjusted[0] if adjusted is not None else None
            if x_position is None:
                continue
            if player_id in goalkeeper_candidates:
                continue
            if team in (1, 2):
                team_positions[int(team)].append(float(x_position))

    if not goalkeeper_candidates:
        clear_goalkeeper_flags(tracks, set())
        return {"detected": 0, "assigned": 0, "items": []}

    side_mapping = infer_side_mapping(team_positions)
    selected_goalkeepers = select_goalkeepers_by_hardcoded_team(goalkeeper_candidates, team_colors)

    items = []
    assigned = 0
    assigned_goalkeeper_ids: set[int] = set()
    ordered_goalkeepers = sorted(
        selected_goalkeepers.items(),
        key=lambda item: (
            int(item[1].get("frames", 0)),
            float(item[1].get("score", 0.0)),
        ),
        reverse=True,
    )
    for goalkeeper_id, candidate in ordered_goalkeepers:
        observation = observations.get(goalkeeper_id, {})
        x_median = float(candidate["medianX"])
        inferred_team = int(candidate["targetTeam"])
        kit = str(candidate["goalkeeperKit"])
        confidence = max(0.75, min(0.98, 0.72 + float(candidate.get("kitMatchRatio", 0.0)) * 0.24))
        reason = f"hardcoded_goalkeeper_color:{kit}"

        apply_goalkeeper_team(
            tracks,
            goalkeeper_id,
            inferred_team,
            team_colors.get(inferred_team, DEFAULT_TEAM_COLORS_BGR[inferred_team]),
            confidence,
            reason,
        )
        assigned_goalkeeper_ids.add(goalkeeper_id)
        assigned += 1
        items.append(
            {
                "id": goalkeeper_id,
                "team": inferred_team,
                "teamConfidence": round(confidence, 3),
                "reason": reason,
                "medianX": round(x_median, 3),
                "frames": int(candidate.get("frames", 0)),
                "edgeRatio": round(float(observation.get("edgeRatio", 0.0)), 3),
                "goalkeeperKit": kit,
                "kitMatchFrames": int(candidate.get("kitMatchFrames", 0)),
                "kitMatchRatio": round(float(candidate.get("kitMatchRatio", 0.0)), 3),
            }
        )

    clear_goalkeeper_flags(tracks, assigned_goalkeeper_ids)

    return {
        "detected": len(goalkeeper_candidates),
        "assigned": assigned,
        "sideMapping": side_mapping,
        "items": items,
    }


def representative_team_colors(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    excluded_players: dict[int, dict[str, Any]] | None = None,
) -> dict[int, tuple[int, int, int]]:
    """Choose stable marker colors instead of trusting the first track in a team."""
    excluded_ids = set(excluded_players or {})
    candidates: dict[int, dict[tuple[int, int, int], list[float]]] = defaultdict(lambda: defaultdict(list))

    for frame_players in tracks["players"]:
        for player_id, player in frame_players.items():
            if player_id in excluded_ids:
                continue
            team = player.get("team")
            raw_color = player.get("team_color")
            if team not in (1, 2) or raw_color is None:
                continue
            try:
                color = tuple(int(channel) for channel in raw_color[:3])
            except (TypeError, ValueError, IndexError):
                continue

            confidence = player.get("team_confidence")
            try:
                confidence_score = max(0.0, min(1.0, float(confidence)))
            except (TypeError, ValueError):
                confidence_score = 0.0
            distance = player.get("team_color_distance")
            try:
                distance_score = max(0.0, 1.0 - min(1.0, float(distance) / 130.0)) * 0.35
            except (TypeError, ValueError):
                distance_score = 0.0
            candidates[int(team)][color].append(confidence_score + distance_score)

    result: dict[int, tuple[int, int, int]] = {}
    for team, colors in candidates.items():
        color, _scores = max(
            colors.items(),
            key=lambda item: (len(item[1]), max(item[1]), sum(item[1])),
        )
        result[team] = color
    return result


def collect_player_observations(tracks: dict[str, list[dict[int, dict[str, Any]]]]) -> dict[int, dict[str, Any]]:
    observations: dict[int, dict[str, Any]] = {}
    all_x_positions: list[float] = []

    for frame_players in tracks["players"]:
        for player_id, player in frame_players.items():
            transformed = player.get("position_transformed")
            adjusted = player.get("position_adjusted")
            x_position = transformed[0] if transformed is not None else adjusted[0] if adjusted is not None else None
            if x_position is None:
                continue
            x_value = float(x_position)
            all_x_positions.append(x_value)
            item = observations.setdefault(
                player_id,
                {
                    "positions": [],
                    "teams": {},
                    "goalkeeperKits": defaultdict(int),
                    "explicitGoalkeeper": False,
                    "explicitGoalkeeperFrames": 0,
                },
            )
            item["positions"].append(x_value)
            team = player.get("team")
            if team in (1, 2):
                item["teams"][int(team)] = item["teams"].get(int(team), 0) + 1
            if player.get("isGoalkeeper") or player.get("role") == "goalkeeper":
                item["explicitGoalkeeper"] = True
                item["explicitGoalkeeperFrames"] += 1
                goalkeeper_kit = player.get("goalkeeperKit") or classify_hardcoded_goalkeeper_color(
                    player.get("jersey_color")
                )
                if goalkeeper_kit in GOALKEEPER_KIT_TO_FIELD_KIT:
                    item["goalkeeperKits"][str(goalkeeper_kit)] += 1

    if not all_x_positions:
        return observations

    observed_min = min(all_x_positions)
    observed_max = max(all_x_positions)
    observed_span = max(1.0, observed_max - observed_min)
    low_cut = observed_min + observed_span * 0.18
    high_cut = observed_min + observed_span * 0.82

    for item in observations.values():
        positions = item["positions"]
        edge_frames = sum(1 for value in positions if value <= low_cut or value >= high_cut)
        edge_depths = [min(abs(value - observed_min), abs(observed_max - value)) / observed_span for value in positions]
        item["edgeRatio"] = edge_frames / max(1, len(positions))
        item["edgeDepthRatio"] = 1.0 - min(1.0, median(edge_depths) / 0.32)
        item["xSpanRatio"] = (max(positions) - min(positions)) / observed_span if len(positions) > 1 else 0.0

    return observations


def score_goalkeeper_candidates(observations: dict[int, dict[str, Any]]) -> dict[int, dict[str, Any]]:
    candidates: dict[int, dict[str, Any]] = {}
    for player_id, item in observations.items():
        frames = len(item.get("positions", []))
        edge_ratio = float(item.get("edgeRatio", 0.0))
        edge_depth = float(item.get("edgeDepthRatio", 0.0))
        x_span_ratio = float(item.get("xSpanRatio", 1.0))
        stillness = max(0.0, 1.0 - min(1.0, x_span_ratio / 0.42))
        positions = item.get("positions", [])
        goalkeeper_kits = item.get("goalkeeperKits", {})
        if not positions or not item.get("explicitGoalkeeper") or not goalkeeper_kits:
            continue

        goalkeeper_kit, kit_match_frames = max(
            goalkeeper_kits.items(),
            key=lambda item: int(item[1]),
        )
        explicit_frames = max(1, int(item.get("explicitGoalkeeperFrames", 0)))
        kit_match_ratio = int(kit_match_frames) / explicit_frames
        if kit_match_ratio < 0.35:
            continue
        score = 0.52 + min(1.0, kit_match_ratio) * 0.28 + edge_ratio * 0.10 + edge_depth * 0.05 + stillness * 0.05

        candidates[player_id] = {
            "id": player_id,
            "reason": "hardcoded_goalkeeper_color",
            "score": round(min(1.0, score), 4),
            "medianX": median([float(value) for value in positions]),
            "frames": frames,
            "edgeRatio": edge_ratio,
            "edgeDepthRatio": edge_depth,
            "xSpanRatio": x_span_ratio,
            "explicitGoalkeeperFrames": explicit_frames,
            "goalkeeperKit": str(goalkeeper_kit),
            "kitMatchFrames": int(kit_match_frames),
            "kitMatchRatio": kit_match_ratio,
        }
    return candidates


def retain_persistent_goalkeeper_candidates(
    candidates: dict[int, dict[str, Any]],
    total_frames: int,
) -> dict[int, dict[str, Any]]:
    minimum_frames = max(2, min(12, (max(1, total_frames) + 49) // 50))
    return {
        player_id: candidate
        for player_id, candidate in candidates.items()
        if int(candidate.get("frames", 0)) >= minimum_frames
        and int(candidate.get("explicitGoalkeeperFrames", 0)) >= 1
        and int(candidate.get("kitMatchFrames", 0)) >= 1
    }


def select_goalkeepers_by_hardcoded_team(
    candidates: dict[int, dict[str, Any]],
    team_colors: dict[int, tuple[int, int, int]],
) -> dict[int, dict[str, Any]]:
    by_team: dict[int, list[dict[str, Any]]] = {1: [], 2: []}
    for candidate in candidates.values():
        goalkeeper_kit = str(candidate.get("goalkeeperKit") or "")
        target_team = resolve_hardcoded_goalkeeper_team(goalkeeper_kit, team_colors)
        if target_team not in (1, 2):
            continue
        resolved = {**candidate, "targetTeam": target_team}
        by_team[target_team].append(resolved)

    selected: dict[int, dict[str, Any]] = {}
    for team in (1, 2):
        best = best_goalkeeper_candidate(by_team[team])
        if best:
            selected[int(best["id"])] = best
    return selected


def resolve_hardcoded_goalkeeper_team(
    goalkeeper_kit: str,
    team_colors: dict[int, tuple[int, int, int]],
) -> int | None:
    field_kit = GOALKEEPER_KIT_TO_FIELD_KIT.get(goalkeeper_kit)
    if field_kit is None:
        return None
    reference = FIELD_KIT_REFERENCE_BGR[field_kit]
    available = {
        team: color
        for team, color in team_colors.items()
        if team in (1, 2) and isinstance(color, (list, tuple)) and len(color) >= 3
    }
    if len(available) < 2:
        return DEFAULT_GOALKEEPER_TEAMS[goalkeeper_kit]
    return min(
        available,
        key=lambda team: squared_color_distance(available[team], reference),
    )


def squared_color_distance(left: Any, right: Any) -> float:
    return sum((float(left[index]) - float(right[index])) ** 2 for index in range(3))


def best_goalkeeper_candidate(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda candidate: (
            int(candidate.get("frames", 0)),
            float(candidate.get("score", 0.0)),
            float(candidate.get("edgeDepthRatio", 0.0)),
            float(candidate.get("edgeRatio", 0.0)),
        ),
    )


def clear_goalkeeper_flags(tracks: dict[str, list[dict[int, dict[str, Any]]]], selected_ids: set[int]) -> None:
    for frame_players in tracks["players"]:
        for player_id, player in frame_players.items():
            if player_id in selected_ids:
                continue
            if player.get("isGoalkeeper") or player.get("role") == "goalkeeper":
                player.pop("isGoalkeeper", None)
                if player.get("role") == "goalkeeper":
                    player.pop("role", None)
                player.pop("teamConfidence", None)
                player.pop("teamAssignmentReason", None)


def infer_side_mapping(team_positions: dict[int, list[float]]) -> dict[str, Any]:
    if not team_positions[1] or not team_positions[2]:
        return {}
    all_positions = team_positions[1] + team_positions[2]
    team1_x = median(team_positions[1])
    team2_x = median(team_positions[2])
    observed_min = min(all_positions)
    observed_max = max(all_positions)
    observed_span = observed_max - observed_min
    if observed_span <= 0:
        return {}
    split_x = (team1_x + team2_x) / 2
    if abs(team1_x - team2_x) >= max(1.0, observed_span * 0.04):
        return {
            "leftTeam": 1 if team1_x < team2_x else 2,
            "rightTeam": 2 if team1_x < team2_x else 1,
            "splitX": split_x,
            "observedSpan": observed_span,
            "method": "median_x",
        }

    low_cut = observed_min + observed_span * 0.33
    high_cut = observed_min + observed_span * 0.67
    team1_left_score = side_presence_score(team_positions[1], low_cut, high_cut)
    team2_left_score = side_presence_score(team_positions[2], low_cut, high_cut)
    if abs(team1_left_score - team2_left_score) < max(3.0, len(all_positions) * 0.01):
        return {}
    return {
        "leftTeam": 1 if team1_left_score > team2_left_score else 2,
        "rightTeam": 2 if team1_left_score > team2_left_score else 1,
        "splitX": observed_min + observed_span * 0.5,
        "observedSpan": observed_span,
        "method": "side_presence",
    }


def side_presence_score(positions: list[float], low_cut: float, high_cut: float) -> float:
    left = sum(1 for value in positions if value <= low_cut)
    right = sum(1 for value in positions if value >= high_cut)
    return float(left - right)


def infer_goalkeeper_team(x_position: float, side_mapping: dict[str, Any], previous_team: int | None) -> int | None:
    if side_mapping:
        return side_mapping["leftTeam"] if x_position <= float(side_mapping["splitX"]) else side_mapping["rightTeam"]
    return previous_team


def goalkeeper_confidence(x_position: float, side_mapping: dict[str, Any], inferred_team: int | None) -> float:
    if inferred_team not in (1, 2) or not side_mapping:
        return 0.25
    observed_span = max(1.0, float(side_mapping.get("observedSpan") or 1.0))
    split_x = float(side_mapping["splitX"])
    normalized_distance_from_midfield = min(1.0, abs(x_position - split_x) / (observed_span / 2))
    return max(0.35, min(0.92, 0.45 + normalized_distance_from_midfield * 0.65))


def apply_goalkeeper_team(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    goalkeeper_id: int,
    team: int,
    team_color: tuple[int, int, int],
    confidence: float,
    reason: str,
) -> None:
    for frame_players in tracks["players"]:
        player = frame_players.get(goalkeeper_id)
        if not player:
            continue
        player["team"] = team
        player["team_color"] = team_color
        player["role"] = "goalkeeper"
        player["isGoalkeeper"] = True
        player["teamConfidence"] = round(confidence, 3)
        player["teamAssignmentReason"] = reason
