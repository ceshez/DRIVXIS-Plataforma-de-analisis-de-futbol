from __future__ import annotations

from typing import Any

from .common import DEFAULT_TEAM_COLORS_BGR, median


def assign_goalkeeper_teams(tracks: dict[str, list[dict[int, dict[str, Any]]]]) -> dict[str, Any]:
    observations = collect_player_observations(tracks)
    goalkeeper_candidates = score_goalkeeper_candidates(observations)
    team_positions: dict[int, list[float]] = {1: [], 2: []}
    team_colors: dict[int, tuple[int, int, int]] = {}
    goalkeeper_current_team: dict[int, int] = {}

    for frame_players in tracks["players"]:
        for player_id, player in frame_players.items():
            team = player.get("team")
            transformed = player.get("position_transformed")
            adjusted = player.get("position_adjusted")
            x_position = transformed[0] if transformed is not None else adjusted[0] if adjusted is not None else None
            if x_position is None:
                continue
            if player_id in goalkeeper_candidates:
                if team in (1, 2):
                    goalkeeper_current_team[player_id] = int(team)
                continue
            if team in (1, 2):
                team_positions[int(team)].append(float(x_position))
                if int(team) not in team_colors and player.get("team_color"):
                    team_colors[int(team)] = tuple(int(channel) for channel in player["team_color"][:3])

    if not goalkeeper_candidates:
        clear_goalkeeper_flags(tracks, set())
        return {"detected": 0, "assigned": 0, "items": []}

    side_mapping = infer_side_mapping(team_positions)
    selected_goalkeepers = select_goalkeepers(goalkeeper_candidates, side_mapping, goalkeeper_current_team)
    clear_goalkeeper_flags(tracks, set(selected_goalkeepers))

    items = []
    assigned = 0
    for goalkeeper_id, candidate in selected_goalkeepers.items():
        observation = observations.get(goalkeeper_id, {})
        x_median = float(candidate["medianX"])
        inferred_team = infer_goalkeeper_team(x_median, side_mapping, goalkeeper_current_team.get(goalkeeper_id))
        confidence = goalkeeper_confidence(x_median, side_mapping, inferred_team)
        candidate_reason = str(candidate.get("reason") or "model_goalkeeper")
        reason = "goal_side_context" if inferred_team in (1, 2) and side_mapping else "fallback_previous_team"
        if inferred_team not in (1, 2):
            inferred_team = goalkeeper_current_team.get(goalkeeper_id, 1)
            confidence = 0.25
            reason = "fallback_default"
        if candidate_reason != "model_goalkeeper":
            reason = f"{reason}+{candidate_reason}"

        apply_goalkeeper_team(tracks, goalkeeper_id, inferred_team, team_colors.get(inferred_team, DEFAULT_TEAM_COLORS_BGR[inferred_team]), confidence, reason)
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
                "colorOutlierRatio": round(float(observation.get("colorOutlierRatio", 0.0)), 3),
            }
        )

    return {
        "detected": len(goalkeeper_candidates),
        "assigned": assigned,
        "sideMapping": side_mapping,
        "items": items,
    }


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
                    "colorDistances": [],
                    "explicitGoalkeeper": False,
                },
            )
            item["positions"].append(x_value)
            team = player.get("team")
            if team in (1, 2):
                item["teams"][int(team)] = item["teams"].get(int(team), 0) + 1
            if player.get("isGoalkeeper") or player.get("role") == "goalkeeper":
                item["explicitGoalkeeper"] = True
            if isinstance(player.get("team_color_distance"), (int, float)):
                item["colorDistances"].append(float(player["team_color_distance"]))

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
        color_distances = item["colorDistances"]
        item["colorOutlierRatio"] = (
            sum(1 for value in color_distances if value >= 58.0) / max(1, len(color_distances))
            if color_distances
            else 0.0
        )

    return observations


def score_goalkeeper_candidates(observations: dict[int, dict[str, Any]]) -> dict[int, dict[str, Any]]:
    candidates: dict[int, dict[str, Any]] = {}
    for player_id, item in observations.items():
        frames = len(item.get("positions", []))
        edge_ratio = float(item.get("edgeRatio", 0.0))
        edge_depth = float(item.get("edgeDepthRatio", 0.0))
        color_outlier_ratio = float(item.get("colorOutlierRatio", 0.0))
        x_span_ratio = float(item.get("xSpanRatio", 1.0))
        stillness = max(0.0, 1.0 - min(1.0, x_span_ratio / 0.42))
        positions = item.get("positions", [])
        if not positions:
            continue

        reason = ""
        if item.get("explicitGoalkeeper"):
            if edge_ratio < 0.28 and color_outlier_ratio < 0.25 and x_span_ratio > 0.46:
                continue
            reason = "model_goalkeeper"
            score = 0.48 + edge_ratio * 0.22 + edge_depth * 0.14 + min(1.0, color_outlier_ratio) * 0.08 + stillness * 0.08
        elif frames >= 4 and edge_ratio >= 0.72 and color_outlier_ratio >= 0.50 and x_span_ratio <= 0.30:
            reason = "goal_zone_color_outlier"
            score = 0.32 + edge_ratio * 0.28 + edge_depth * 0.18 + min(1.0, color_outlier_ratio) * 0.14 + stillness * 0.08
        elif frames >= 8 and edge_ratio >= 0.78 and edge_depth >= 0.48 and x_span_ratio <= 0.22:
            reason = "goal_zone_persistence"
            score = 0.28 + edge_ratio * 0.30 + edge_depth * 0.26 + stillness * 0.12
        else:
            continue

        candidates[player_id] = {
            "id": player_id,
            "reason": reason,
            "score": round(min(1.0, score), 4),
            "medianX": median([float(value) for value in positions]),
            "frames": frames,
            "edgeRatio": edge_ratio,
            "edgeDepthRatio": edge_depth,
            "colorOutlierRatio": color_outlier_ratio,
            "xSpanRatio": x_span_ratio,
        }
    return candidates


def select_goalkeepers(
    candidates: dict[int, dict[str, Any]],
    side_mapping: dict[str, Any],
    previous_teams: dict[int, int],
) -> dict[int, dict[str, Any]]:
    if not candidates:
        return {}

    selected: dict[int, dict[str, Any]] = {}
    if side_mapping:
        split_x = float(side_mapping["splitX"])
        left = [candidate for candidate in candidates.values() if float(candidate["medianX"]) <= split_x]
        right = [candidate for candidate in candidates.values() if float(candidate["medianX"]) > split_x]
        for side_candidates in (left, right):
            best = best_goalkeeper_candidate(side_candidates)
            if best:
                selected[int(best["id"])] = best
    else:
        by_team: dict[int, list[dict[str, Any]]] = {1: [], 2: []}
        for player_id, candidate in candidates.items():
            team = previous_teams.get(player_id)
            if team in (1, 2):
                by_team[team].append(candidate)
        for team in (1, 2):
            best = best_goalkeeper_candidate(by_team[team])
            if best:
                selected[int(best["id"])] = best

    if len(selected) > 2:
        ordered = sorted(selected.values(), key=lambda candidate: float(candidate["score"]), reverse=True)[:2]
        selected = {int(candidate["id"]): candidate for candidate in ordered}
    return selected


def best_goalkeeper_candidate(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda candidate: (
            float(candidate.get("score", 0.0)),
            int(candidate.get("frames", 0)),
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
