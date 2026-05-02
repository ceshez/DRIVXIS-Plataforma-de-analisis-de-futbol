from __future__ import annotations

import unittest

import numpy as np

from analysis.pipeline.ball import assign_ball_control, interpolate_ball_positions
from analysis.pipeline.goalkeepers import assign_goalkeeper_teams
from analysis.pipeline.metrics import build_metrics
from analysis.pipeline.reid import assign_stable_player_ids
from analysis.pipeline.speed_distance import add_speed_and_distance
from analysis.pipeline.team_assigner import TeamAssigner


class AnalysisPipelineTests(unittest.TestCase):
    def test_detected_colors_handles_numpy_arrays_without_truth_value_error(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        assigner.team_colors[1] = np.array([20, 40, 200], dtype=float)
        assigner.team_colors[2] = np.array([230, 230, 230], dtype=float)
        colors = assigner.get_detected_colors()
        self.assertEqual(colors["team1"], "#c82814")
        self.assertEqual(colors["team2"], "#e6e6e6")
        self.assertIn("confidence", colors)

    def test_team_color_refit_keeps_team_identity_when_cluster_order_flips(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        assigner.sample_count = 4
        assigner._fit_team_colors(
            [
                np.array([20, 40, 200], dtype=float),
                np.array([22, 42, 202], dtype=float),
                np.array([230, 230, 230], dtype=float),
                np.array([232, 232, 232], dtype=float),
            ]
        )
        assigner.sample_count = 8
        assigner._fit_team_colors(
            [
                np.array([230, 230, 230], dtype=float),
                np.array([232, 232, 232], dtype=float),
                np.array([20, 40, 200], dtype=float),
                np.array([22, 42, 202], dtype=float),
            ]
        )

        self.assertLess(np.linalg.norm(assigner.team_colors[1] - np.array([21, 41, 201])), 3)
        self.assertLess(np.linalg.norm(assigner.team_colors[2] - np.array([231, 231, 231])), 3)

    def test_team_assignment_keeps_previous_team_when_detection_is_ambiguous(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        assigner.player_team[17] = 2
        assigner.player_locked_team[17] = 2
        assigner.player_team_votes[17] = {2: 8}

        stable_team = assigner._stabilize_team_assignment(
            17,
            detected_team=1,
            distances={1: 36.0, 2: 43.0},
            margin=7.0,
            confidence=0.11,
        )

        self.assertEqual(stable_team, 2)
        self.assertEqual(assigner.player_team[17], 2)

    def test_team_assignment_requires_sustained_confidence_before_switching(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        assigner.player_team[1] = 1
        assigner.player_locked_team[1] = 1
        assigner.player_team_votes[1] = {1: 9}

        for _ in range(5):
            stable_team = assigner._stabilize_team_assignment(
                1,
                detected_team=2,
                distances={1: 78.0, 2: 22.0},
                margin=56.0,
                confidence=0.86,
            )
            self.assertEqual(stable_team, 1)

        stable_team = assigner._stabilize_team_assignment(
            1,
            detected_team=2,
            distances={1: 78.0, 2: 22.0},
            margin=56.0,
            confidence=0.86,
        )

        self.assertEqual(stable_team, 2)
        self.assertEqual(assigner.player_team[1], 2)

    def test_crossing_players_are_marked_as_contaminated_for_color_assignment(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        frame_players = {
            1: {"bbox": [10, 10, 30, 60]},
            17: {"bbox": [22, 12, 42, 60]},
            8: {"bbox": [120, 10, 140, 60]},
        }

        assigner.mark_contaminated_tracks(frame_players)

        self.assertEqual(assigner.contaminated_players, {1, 17})
        self.assertTrue(frame_players[1]["team_color_contaminated"])
        self.assertNotIn("team_color_contaminated", frame_players[8])

    def test_stable_id_mapping_does_not_duplicate_ids_in_same_frame(self) -> None:
        tracks = {
            "players": [
                {10: player([0, 0, 10, 20], [1, 1], 1)},
                {10: player([1, 0, 11, 20], [2, 1], 1), 11: player([50, 0, 60, 20], [45, 1], 1)},
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }
        summary = assign_stable_player_ids(tracks, fps=25, frame_size=(100, 100))
        frame_ids = list(tracks["players"][1].keys())
        self.assertEqual(len(frame_ids), len(set(frame_ids)))
        self.assertGreaterEqual(summary["displayPlayers"], 2)

    def test_speed_rejection_does_not_publish_low_sample_high_speed_record(self) -> None:
        tracks = {
            "players": [
                {1: player([0, 0, 10, 20], [0, 0], 1)},
                {1: player([0, 0, 10, 20], [0, 0], 1)},
                {1: player([0, 0, 10, 20], [0, 0], 1)},
                {1: player([0, 0, 10, 20], [0, 0], 1)},
                {1: player([0, 0, 10, 20], [0, 0], 1)},
                {1: player([0, 0, 10, 20], [2.5, 0], 1)},
            ],
            "referees": [{} for _ in range(6)],
            "ball": [{} for _ in range(6)],
        }
        quality = add_speed_and_distance(tracks, fps=25, calibration={"calibrationStatus": "test", "confidence": 0.5})
        metrics = build_metrics(tracks, [0] * 6, 25, quality, {}, {}, {}, {}, {}, {})
        self.assertEqual(metrics["speed"]["maxKmh"], 0)
        self.assertGreater(quality["rejectionReasons"].get("low_sample_high_speed", 0), 0)
        self.assertFalse(any(player_info.get("display_speed_sample") for frame in tracks["players"] for player_info in frame.values()))

    def test_speed_overlay_requires_enough_trusted_samples(self) -> None:
        frames = []
        for index in range(31):
            frames.append({1: player([0, 0, 10, 20], [index * 0.08, 0], 1)})
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = add_speed_and_distance(tracks, fps=25, calibration={"calibrationStatus": "test", "confidence": 0.9})

        self.assertGreaterEqual(quality["players"][1], 5)
        self.assertTrue(any(player_info.get("display_speed_sample") for frame in tracks["players"] for player_info in frame.values()))

    def test_ball_interpolation_fills_short_gaps_only(self) -> None:
        tracks = {
            "players": [{} for _ in range(12)],
            "referees": [{} for _ in range(12)],
            "ball": [{} for _ in range(12)],
        }
        tracks["ball"][0][1] = {"bbox": [0, 0, 2, 2], "position": (1, 1), "position_adjusted": (1, 1), "position_transformed": [1, 1]}
        tracks["ball"][2][1] = {"bbox": [2, 0, 4, 2], "position": (3, 1), "position_adjusted": (3, 1), "position_transformed": [3, 1]}
        tracks["ball"][11][1] = {"bbox": [11, 0, 13, 2], "position": (12, 1), "position_adjusted": (12, 1), "position_transformed": [12, 1]}
        quality = interpolate_ball_positions(tracks, max_gap=3)
        self.assertIn(1, tracks["ball"][1])
        self.assertNotIn(1, tracks["ball"][6])
        self.assertEqual(quality["interpolatedFrames"], 1)

    def test_ball_control_uses_tutorial_like_player_ball_distance(self) -> None:
        tracks = {
            "players": [
                {
                    1: player([0, 0, 20, 40], [10, 10], 1),
                    2: player([180, 0, 200, 40], [190, 10], 2),
                }
            ],
            "referees": [{}],
            "ball": [{1: {"bbox": [76, 28, 84, 36], "position": (80, 32), "position_adjusted": (80, 32), "position_transformed": [80, 32]}}],
        }

        control, quality = assign_ball_control(tracks, (1280, 720))

        self.assertEqual(control, [1])
        self.assertTrue(tracks["players"][0][1]["has_ball"])
        self.assertGreaterEqual(quality["maxPlayerBallDistance"], 70)

    def test_goalkeeper_with_different_shirt_uses_field_context(self) -> None:
        tracks = {
            "players": [
                {
                    1: player([10, 0, 20, 30], [18, 20], 1),
                    2: player([60, 0, 70, 30], [78, 20], 2),
                    99: {**player([2, 0, 12, 30], [5, 20], 2), "role": "goalkeeper", "isGoalkeeper": True},
                },
                {
                    1: player([12, 0, 22, 30], [20, 22], 1),
                    2: player([62, 0, 72, 30], [80, 22], 2),
                    99: {**player([3, 0, 13, 30], [6, 22], 2), "role": "goalkeeper", "isGoalkeeper": True},
                },
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(tracks["players"][0][99]["team"], 1)
        self.assertEqual(tracks["players"][1][99]["team"], 1)
        self.assertEqual(quality["assigned"], 1)
        self.assertEqual(quality["items"][0]["reason"], "goal_side_context")

    def test_goalkeeper_can_be_inferred_from_goal_zone_and_color_outlier(self) -> None:
        tracks = {
            "players": [
                {
                    1: player([18, 0, 28, 30], [22, 20], 1),
                    2: player([62, 0, 72, 30], [78, 20], 2),
                    77: {**player([2, 0, 12, 30], [5, 20], 2), "team_color_distance": 92.0},
                },
                {
                    1: player([20, 0, 30, 30], [24, 22], 1),
                    2: player([64, 0, 74, 30], [80, 22], 2),
                    77: {**player([3, 0, 13, 30], [6, 22], 2), "team_color_distance": 94.0},
                },
                {
                    1: player([22, 0, 32, 30], [26, 21], 1),
                    2: player([66, 0, 76, 30], [82, 21], 2),
                    77: {**player([4, 0, 14, 30], [7, 21], 2), "team_color_distance": 91.0},
                },
                {
                    1: player([24, 0, 34, 30], [28, 21], 1),
                    2: player([68, 0, 78, 30], [84, 21], 2),
                    77: {**player([5, 0, 15, 30], [8, 21], 2), "team_color_distance": 90.0},
                },
            ],
            "referees": [{}, {}, {}, {}],
            "ball": [{}, {}, {}, {}],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(tracks["players"][0][77]["team"], 1)
        self.assertTrue(tracks["players"][0][77]["isGoalkeeper"])
        self.assertEqual(quality["assigned"], 1)
        self.assertIn("goal_zone_color_outlier", quality["items"][0]["reason"])

    def test_goalkeeper_assignment_is_capped_to_one_per_side(self) -> None:
        tracks = {
            "players": [
                {
                    1: player([20, 0, 30, 30], [24, 20], 1),
                    2: player([70, 0, 80, 30], [84, 20], 2),
                    90: {**player([2, 0, 12, 30], [5, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "team_color_distance": 80.0},
                    91: {**player([4, 0, 14, 30], [7, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "team_color_distance": 60.0},
                    92: {**player([88, 0, 98, 30], [96, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "team_color_distance": 82.0},
                    93: {**player([60, 0, 70, 30], [55, 20], 2), "role": "goalkeeper", "isGoalkeeper": True},
                },
                {
                    1: player([21, 0, 31, 30], [25, 20], 1),
                    2: player([71, 0, 81, 30], [85, 20], 2),
                    90: {**player([3, 0, 13, 30], [6, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "team_color_distance": 80.0},
                    91: {**player([5, 0, 15, 30], [8, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "team_color_distance": 60.0},
                    92: {**player([87, 0, 97, 30], [95, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "team_color_distance": 82.0},
                    93: {**player([61, 0, 71, 30], [56, 20], 2), "role": "goalkeeper", "isGoalkeeper": True},
                },
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }

        quality = assign_goalkeeper_teams(tracks)
        selected_ids = {item["id"] for item in quality["items"]}

        self.assertLessEqual(quality["assigned"], 2)
        self.assertEqual(selected_ids, {90, 92})
        self.assertTrue(tracks["players"][0][90]["isGoalkeeper"])
        self.assertTrue(tracks["players"][0][92]["isGoalkeeper"])
        self.assertNotIn("isGoalkeeper", tracks["players"][0][91])
        self.assertNotIn("isGoalkeeper", tracks["players"][0][93])

    def test_goalkeepers_do_not_affect_team_color_sampling(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        assigner.get_player_color = lambda frame, bbox: np.array([10, 20, 30], dtype=float)  # type: ignore[method-assign]
        frame = np.zeros((24, 24, 3), dtype=np.uint8)

        assigner.collect_samples(
            frame,
            {
                1: {"bbox": [1, 1, 8, 16], "role": "goalkeeper", "isGoalkeeper": True},
                2: {"bbox": [10, 1, 18, 16]},
            },
        )

        self.assertEqual(assigner.sample_count, 1)

    def test_metrics_distance_by_team_and_speed_is_diagnostic_only(self) -> None:
        tracks = {
            "players": [
                {
                    1: {**player([0, 0, 10, 20], [10, 10], 1), "speed": 22.0, "distance": 1000.0},
                    2: {**player([20, 0, 30, 20], [70, 10], 2), "speed": 31.5, "distance": 1400.0},
                },
                {
                    1: {**player([1, 0, 11, 20], [11, 10], 1), "speed": 24.0, "distance": 1200.0},
                    2: {**player([21, 0, 31, 20], [71, 10], 2), "speed": 34.4, "distance": 1600.0},
                },
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }

        metrics = build_metrics(
            tracks,
            [1, 2],
            25,
            {
                "validSamples": 12,
                "rejectedSamples": 0,
                "rejectionReasons": {},
                "calibrationStatus": "test",
                "confidence": 1.0,
                "calibrationConfidence": 1.0,
                "players": {1: 6, 2: 6},
                "untrustedPlayers": [],
            },
            {"displayPlayers": 2},
            {"detected": 0, "assigned": 0, "items": []},
            {"interpolatedFrames": 0, "detectedFrames": 0, "confidence": 0},
            {"directAssignments": 0, "carriedAssignments": 0, "unknownFrames": 0},
            {"ownTeam": "Local", "rivalTeam": "Visitante"},
            {"team1": "#ffffff", "team2": "#00ff00", "confidence": 0.9, "sampleCount": 40, "tentative": False},
        )

        self.assertEqual(metrics["speed"]["players"], [])
        self.assertEqual(metrics["speed"]["maxKmh"], 0)
        self.assertFalse(metrics["speed"]["publishable"])
        self.assertEqual(metrics["ballControl"]["ownTeam"], 50.0)
        self.assertEqual(metrics["distance"]["teams"]["own"]["totalMeters"], 1200.0)
        self.assertEqual(metrics["distance"]["teams"]["rival"]["totalMeters"], 1600.0)
        self.assertEqual(metrics["teamDistances"]["ownTeam"], 1200.0)

    def test_metrics_v1_contains_quality_without_breaking_contract(self) -> None:
        tracks = {
            "players": [{1: {"bbox": [0, 0, 10, 20], "team": 1, "speed": 18.0, "distance": 5.0}}],
            "referees": [{}],
            "ball": [{}],
        }
        metrics = build_metrics(
            tracks,
            [1],
            25,
            {
                "validSamples": 6,
                "rejectedSamples": 1,
                "rejectionReasons": {"outside_pitch": 1},
                "calibrationStatus": "default_homography",
                "confidence": 0.5,
                "calibrationConfidence": 0.4,
                "players": {1: 6},
                "untrustedPlayers": [],
            },
            {"displayPlayers": 1, "sourceTracks": 1, "remappedSources": 0, "fragmentationRatio": 1.0, "confidence": 1.0},
            {"detected": 0, "assigned": 0, "items": []},
            {"interpolatedFrames": 0, "detectedFrames": 0, "confidence": 0},
            {"directAssignments": 1, "carriedAssignments": 0, "unknownFrames": 0},
            {"ownTeam": "A", "rivalTeam": "B"},
            {"team1": "#ffffff", "team2": "#000000", "confidence": 0.8, "sampleCount": 20, "tentative": False},
        )
        self.assertEqual(metrics["version"], 1)
        self.assertIn("quality", metrics)
        self.assertEqual(metrics["match"]["detectedTeamColors"]["sampleCount"], 20)


def player(bbox: list[float], transformed: list[float], team: int) -> dict:
    return {
        "bbox": bbox,
        "position": (int((bbox[0] + bbox[2]) / 2), int(bbox[3])),
        "position_adjusted": (int((bbox[0] + bbox[2]) / 2), int(bbox[3])),
        "position_transformed": transformed,
        "team": team,
        "team_color": (0, 0, 255),
    }


class DummyKMeans:
    def __init__(self, n_clusters=2, init=None, n_init=1, random_state=None):
        self.n_clusters = n_clusters
        self.cluster_centers_ = None
        self.labels_ = None

    def fit(self, values):
        array = np.asarray(values, dtype=float)
        if self.n_clusters == 1:
            self.cluster_centers_ = np.array([array.mean(axis=0)])
            self.labels_ = np.zeros(len(array), dtype=int)
            return self
        midpoint = len(array) // 2 or 1
        self.cluster_centers_ = np.array([array[:midpoint].mean(axis=0), array[midpoint:].mean(axis=0)])
        self.labels_ = np.array([0 if index < midpoint else 1 for index in range(len(array))])
        return self

    def predict(self, values):
        value = np.asarray(values, dtype=float)[0]
        distances = [np.linalg.norm(value - center) for center in self.cluster_centers_]
        return np.array([int(np.argmin(distances))])


if __name__ == "__main__":
    unittest.main()
