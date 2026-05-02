from __future__ import annotations

from typing import Any

def build_metrics(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    control: list[int],
    fps: float,
    speed_quality: dict[str, Any],
    tracking_quality: dict[str, Any],
    goalkeeper_quality: dict[str, Any],
    ball_quality: dict[str, Any],
    possession_quality: dict[str, Any],
    match_info: dict[str, Any],
    detected_team_colors: dict[str, Any],
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
                {"id": player_id, "team": player.get("team"), "distanceMeters": 0.0},
            )
            if player.get("team") in (1, 2):
                item["team"] = player.get("team")
            if "speed" in player:
                speed = float(player["speed"])
                all_speeds.append(speed)
            if "distance" in player:
                item["distanceMeters"] = max(float(item["distanceMeters"]), float(player["distance"]))

    players = list(player_accumulator.values())
    total_distance = sum(float(player["distanceMeters"]) for player in players)
    own_distance = sum(float(player["distanceMeters"]) for player in players if player.get("team") == 1)
    rival_distance = sum(float(player["distanceMeters"]) for player in players if player.get("team") == 2)
    raw_max_speed = round(max(all_speeds), 2) if all_speeds else 0
    own_team_name = match_info.get("ownTeam") or "Equipo 1"
    rival_team_name = match_info.get("rivalTeam") or "Equipo 2"
    return {
        "version": 1,
        "source": "football_analysis",
        "match": {
            "ownTeam": own_team_name,
            "rivalTeam": rival_team_name,
            "ownTeamColor": match_info.get("ownTeamColor") or None,
            "rivalTeamColor": match_info.get("rivalTeamColor") or None,
            "ownGoals": int(match_info.get("ownGoals") or 0),
            "rivalGoals": int(match_info.get("rivalGoals") or 0),
            "detectedTeamColors": detected_team_colors,
        },
        "possession": {
            "team1Pct": round(team1_pct, 2),
            "team2Pct": round(team2_pct, 2),
            "unknownPct": round(max(0, unknown_pct), 2),
        },
        "ballControl": {
            "ownTeam": round(team1_pct, 2),
            "rivalTeam": round(team2_pct, 2),
            "unknown": round(max(0, unknown_pct), 2),
        },
        "speed": {
            "maxKmh": 0,
            "avgKmh": 0,
            "rawMaxKmh": raw_max_speed,
            "publishable": False,
            "note": "Speed is retained only as diagnostic quality data because player IDs can be reassigned.",
            "validSamples": int(speed_quality["validSamples"]),
            "rejectedSamples": int(speed_quality["rejectedSamples"]),
            "rejectionReasons": speed_quality["rejectionReasons"],
            "calibrationStatus": speed_quality["calibrationStatus"],
            "confidence": float(speed_quality.get("confidence", 0.0)),
            "untrustedPlayers": speed_quality.get("untrustedPlayers", []),
            "players": [],
        },
        "distance": {
            "totalMeters": round(total_distance, 2),
            "teams": {
                "own": {
                    "name": own_team_name,
                    "totalMeters": round(own_distance, 2),
                    "totalKm": round(own_distance / 1000, 3),
                },
                "rival": {
                    "name": rival_team_name,
                    "totalMeters": round(rival_distance, 2),
                    "totalKm": round(rival_distance / 1000, 3),
                },
            },
        },
        "teamDistances": {
            "ownTeam": round(own_distance, 2),
            "rivalTeam": round(rival_distance, 2),
        },
        "players": {"detected": len(players)},
        "quality": {
            "speed": {
                "confidence": float(speed_quality.get("confidence", 0.0)),
                "untrustedPlayers": speed_quality.get("untrustedPlayers", []),
                "calibrationConfidence": float(speed_quality.get("calibrationConfidence", 0.0)),
            },
            "tracking": tracking_quality,
            "goalkeepers": goalkeeper_quality,
            "ball": ball_quality,
            "possession": possession_quality,
            "teamColors": {
                "confidence": detected_team_colors.get("confidence", 0),
                "sampleCount": detected_team_colors.get("sampleCount", 0),
                "tentative": detected_team_colors.get("tentative", True),
            },
        },
        "video": {
            "frameCount": len(tracks["players"]),
            "fps": round(float(fps), 2),
            "durationSeconds": round(len(tracks["players"]) / (fps or 24), 2),
            "annotatedAvailable": True,
            "processedAvailable": True,
        },
    }
