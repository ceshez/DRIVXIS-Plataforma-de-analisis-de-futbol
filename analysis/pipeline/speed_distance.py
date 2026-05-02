from __future__ import annotations

from typing import Any

from .calibration import is_inside_pitch
from .common import HUMAN_MAX_SPEED_KMH, MIN_TRUSTED_SPEED_SAMPLES, SPEED_WINDOW_FRAMES, measure_distance, median


def add_rejection(quality: dict[str, Any], reason: str) -> None:
    quality["rejectedSamples"] += 1
    quality["rejectionReasons"][reason] = quality["rejectionReasons"].get(reason, 0) + 1


def add_speed_and_distance(
    tracks: dict[str, list[dict[int, dict[str, Any]]]],
    fps: float,
    calibration: dict[str, Any],
) -> dict[str, Any]:
    players = tracks["players"]
    player_distance: dict[int, float] = {}
    player_max_speed: dict[int, float] = {}
    player_trusted_max_speed: dict[int, float] = {}
    player_valid_samples: dict[int, int] = {}
    player_untrusted: dict[int, str] = {}
    candidate_samples: dict[int, list[dict[str, Any]]] = {}
    quality: dict[str, Any] = {
        "validSamples": 0,
        "rejectedSamples": 0,
        "rejectionReasons": {},
        "calibrationStatus": calibration["calibrationStatus"],
        "calibrationConfidence": float(calibration.get("confidence", 0.35)),
        "players": player_valid_samples,
        "untrustedPlayers": [],
        "confidence": 0.0,
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
            if speed_kmh > HUMAN_MAX_SPEED_KMH * 1.75:
                add_rejection(quality, "implausible_absolute_speed")
                player_untrusted[track_id] = "implausible_absolute_speed"
                continue
            candidate_samples.setdefault(track_id, []).append(
                {"frame": frame_num, "lastFrame": last_frame, "distance": distance, "elapsed": elapsed, "speed": speed_kmh}
            )

    for track_id, samples in candidate_samples.items():
        distances = [float(sample["distance"]) for sample in samples]
        speeds = [float(sample["speed"]) for sample in samples]
        median_distance = median(distances)
        median_speed = median(speeds)
        speed_deviation = median([abs(speed - median_speed) for speed in speeds])
        distance_deviation = median([abs(distance - median_distance) for distance in distances])
        previous_accepted_speed: float | None = None

        for sample in samples:
            distance = float(sample["distance"])
            speed_kmh = float(sample["speed"])
            dynamic_distance_limit = median_distance + max(2.1, distance_deviation * 3.5)
            dynamic_speed_limit = median_speed + max(8.0, speed_deviation * 3.5)
            if len(samples) >= 4 and distance > dynamic_distance_limit and speed_kmh > dynamic_speed_limit:
                add_rejection(quality, "tracking_jump_outlier")
                continue

            if speed_kmh > HUMAN_MAX_SPEED_KMH and len(samples) < MIN_TRUSTED_SPEED_SAMPLES:
                add_rejection(quality, "low_sample_high_speed")
                player_untrusted[track_id] = "low_sample_high_speed"
                continue

            if previous_accepted_speed is not None:
                elapsed = float(sample["elapsed"])
                acceleration_mps2 = abs((speed_kmh - previous_accepted_speed) / 3.6) / max(elapsed, 0.001)
                player_baseline_mps = max(median_speed / 3.6, 1.0)
                if acceleration_mps2 > player_baseline_mps * 2.0 + 6.0:
                    add_rejection(quality, "acceleration_outlier")
                    continue

            previous_accepted_speed = speed_kmh
            player_distance[track_id] = player_distance.get(track_id, 0.0) + distance
            player_max_speed[track_id] = max(player_max_speed.get(track_id, 0.0), speed_kmh)
            if speed_kmh <= HUMAN_MAX_SPEED_KMH:
                player_trusted_max_speed[track_id] = max(player_trusted_max_speed.get(track_id, 0.0), speed_kmh)
            player_valid_samples[track_id] = player_valid_samples.get(track_id, 0) + 1
            quality["validSamples"] += 1

            for batch_frame_num in range(int(sample["frame"]), int(sample["lastFrame"]) + 1):
                if track_id in players[batch_frame_num]:
                    players[batch_frame_num][track_id]["speed"] = speed_kmh
                    players[batch_frame_num][track_id]["distance"] = player_distance[track_id]
                    players[batch_frame_num][track_id]["valid_speed_sample"] = True

    for frame_players in players:
        for track_id, player in frame_players.items():
            if track_id in player_max_speed:
                player["raw_max_speed"] = player_max_speed[track_id]
            if track_id in player_trusted_max_speed:
                player["max_speed"] = player_trusted_max_speed[track_id]
            if track_id in player_distance:
                player["distance"] = player_distance[track_id]

    for track_id, count in player_valid_samples.items():
        if count < MIN_TRUSTED_SPEED_SAMPLES:
            player_untrusted.setdefault(track_id, "low_sample_count")

    for frame_players in players:
        for track_id, player in frame_players.items():
            if (
                int(player_valid_samples.get(track_id, 0)) >= MIN_TRUSTED_SPEED_SAMPLES
                and track_id not in player_untrusted
                and "speed" in player
                and "distance" in player
                and float(player.get("speed", 0.0)) <= HUMAN_MAX_SPEED_KMH
            ):
                player["display_speed_sample"] = True

    total_candidates = quality["validSamples"] + quality["rejectedSamples"]
    validity = quality["validSamples"] / max(1, total_candidates)
    quality["confidence"] = round(max(0.0, min(1.0, validity * float(calibration.get("confidence", 0.35)) * 1.7)), 3)
    quality["untrustedPlayers"] = [
        {"id": track_id, "reason": reason, "validSamples": int(player_valid_samples.get(track_id, 0))}
        for track_id, reason in sorted(player_untrusted.items())
    ]
    return quality
