from __future__ import annotations

import unittest

import numpy as np
from sklearn.cluster import KMeans

from analysis.pipeline.ball import assign_ball_control, interpolate_ball_positions
from analysis.pipeline.annotator import draw_player_marker, draw_player_metrics
from analysis.pipeline.goalkeepers import assign_goalkeeper_teams, detect_hardcoded_goalkeeper_kit
from analysis.pipeline.metrics import build_metrics
from analysis.pipeline.reid import assign_stable_player_ids
from analysis.pipeline.speed_distance import add_speed_and_distance
from analysis.pipeline.team_assigner import TeamAssigner
from analysis.pipeline.tracker import scale_bbox_between_frames


class AnalysisPipelineTests(unittest.TestCase):
    def test_color_sampling_bbox_is_scaled_to_native_frame(self) -> None:
        scaled = scale_bbox_between_frames([64, 32, 128, 160], (720, 1280), (1080, 1920))

        self.assertEqual(scaled, [96.0, 48.0, 192.0, 240.0])

    def test_white_kit_is_not_classified_as_green_when_torso_is_small(self) -> None:
        frame = np.full((80, 80, 3), (70, 145, 70), dtype=np.uint8)
        bbox = [30, 20, 38, 44]
        frame[24:28, 32:36] = (35, 35, 35)
        frame[28:34, 33:36] = (210, 210, 210)

        assigner = TeamAssigner(KMeans)
        assigner.team_colors[1] = np.array([210, 210, 210], dtype=float)
        assigner.team_colors[2] = np.array([70, 145, 70], dtype=float)

        info = assigner.get_player_team_info(frame, bbox, player_id=26)

        self.assertEqual(info["team"], 1)
        self.assertLess(np.linalg.norm(np.asarray(info["jersey_color"]) - np.array([210, 210, 210])), 45)

    def test_green_kit_still_uses_torso_color_instead_of_dark_head(self) -> None:
        frame = np.full((80, 80, 3), (70, 145, 70), dtype=np.uint8)
        bbox = [30, 20, 38, 44]
        frame[24:28, 32:36] = (35, 35, 35)
        frame[28:34, 33:36] = (55, 210, 80)

        color = TeamAssigner(KMeans).get_player_color(frame, bbox)

        self.assertLess(np.linalg.norm(np.asarray(color) - np.array([55, 210, 80])), 55)

    def test_goalkeeper_inherits_representative_color_of_hardcoded_team(self) -> None:
        tracks = {
            "players": [
                {
                    1: {**player([10, 0, 20, 30], [10, 20], 1), "team_color": (80, 240, 100), "team_confidence": 0.2},
                    2: {**player([22, 0, 32, 30], [22, 20], 1), "team_color": (245, 245, 245), "team_confidence": 0.92},
                    3: {**player([80, 0, 90, 30], [80, 20], 2), "team_color": (80, 240, 100), "team_confidence": 0.9},
                    99: {**player([2, 0, 12, 30], [4, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (30, 30, 30)},
                },
                {
                    1: {**player([11, 0, 21, 30], [11, 20], 1), "team_color": (80, 240, 100), "team_confidence": 0.2},
                    2: {**player([23, 0, 33, 30], [23, 20], 1), "team_color": (245, 245, 245), "team_confidence": 0.92},
                    3: {**player([81, 0, 91, 30], [81, 20], 2), "team_color": (80, 240, 100), "team_confidence": 0.9},
                    99: {**player([3, 0, 13, 30], [5, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (30, 30, 30)},
                },
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }

        assign_goalkeeper_teams(tracks)

        self.assertEqual(tracks["players"][0][99]["team"], 1)
        self.assertEqual(tracks["players"][0][99]["team_color"], (245, 245, 245))

    def test_goalkeeper_pixel_colors_are_hardcoded_to_black_and_orange(self) -> None:
        black_frame = np.full((100, 60, 3), (80, 145, 80), dtype=np.uint8)
        black_frame[20:56, 17:43] = (25, 25, 25)
        orange_frame = np.full((100, 60, 3), (80, 145, 80), dtype=np.uint8)
        orange_frame[20:56, 17:43] = (40, 100, 225)
        white_frame = np.full((100, 60, 3), (80, 145, 80), dtype=np.uint8)
        white_frame[20:56, 17:43] = (235, 235, 235)
        bbox = [10, 10, 50, 90]

        self.assertEqual(detect_hardcoded_goalkeeper_kit(black_frame, bbox, np), "black")
        self.assertEqual(detect_hardcoded_goalkeeper_kit(orange_frame, bbox, np), "orange")
        self.assertIsNone(detect_hardcoded_goalkeeper_kit(white_frame, bbox, np))

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

    def test_single_team_color_anchor_orients_both_detected_clusters(self) -> None:
        assigner = TeamAssigner(DummyKMeans, color_anchors={1: np.array([20, 40, 200], dtype=float)})
        assigner.sample_count = 4

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

    def test_new_occluded_track_stays_unassigned_instead_of_defaulting_to_team_one(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        assigner.contaminated_players = {77}

        info = assigner.get_player_team_info(np.zeros((24, 24, 3), dtype=np.uint8), [2, 2, 18, 22], 77)

        self.assertEqual(info["team"], 0)
        self.assertEqual(info["team_assignment_state"], "occluded_unassigned")

    def test_reidentified_fragment_inherits_last_confident_team_color(self) -> None:
        tracks = {
            "players": [
                {
                    10: {
                        **player([10, 10, 20, 30], [20, 20], 2),
                        "team_color": (240, 240, 240),
                        "team_confidence": 0.91,
                    }
                },
                {},
                {
                    81: {
                        **player([11, 10, 21, 30], [20.2, 20], 0),
                        "team_color": (128, 128, 128),
                        "team_confidence": 0.0,
                        "team_assignment_state": "occluded_unassigned",
                    }
                },
            ],
            "referees": [{}, {}, {}],
            "ball": [{}, {}, {}],
        }

        assign_stable_player_ids(tracks, fps=25, frame_size=(100, 100))

        recovered = next(iter(tracks["players"][2].values()))
        self.assertEqual(recovered["display_id"], 1)
        self.assertEqual(recovered["team"], 2)
        self.assertEqual(recovered["team_color"], (240, 240, 240))
        self.assertEqual(recovered["team_assignment_state"], "reidentified_team_inherited")

    def test_player_marker_uses_full_high_contrast_team_ring(self) -> None:
        cv2 = RecordingCv2()
        canvas = np.zeros((100, 160, 3), dtype=np.uint8)

        draw_player_marker(cv2, canvas, [40, 20, 70, 72], (80, 240, 100), track_id=12)

        self.assertGreaterEqual(len(cv2.ellipses), 3)
        self.assertTrue(all(call[4:6] == (0, 360) for call in cv2.ellipses[:3]))
        self.assertEqual(cv2.ellipses[0][6], (0, 0, 0))
        self.assertEqual(cv2.ellipses[-1][6], (80, 240, 100))

    def test_accepted_speed_and_distance_are_drawn_as_approximate_values(self) -> None:
        cv2 = RecordingCv2()
        canvas = np.zeros((160, 220, 3), dtype=np.uint8)
        player_info = {
            "speed": 18.46,
            "distance": 73.8,
            "valid_speed_sample": True,
        }

        draw_player_metrics(cv2, canvas, [70, 20, 100, 80], player_info)

        self.assertIn("~18.5 km/h", cv2.texts)
        self.assertIn("~74 m", cv2.texts)

    def test_draw_color_keeps_detected_hue_but_increases_marker_contrast(self) -> None:
        assigner = TeamAssigner(DummyKMeans)
        detected_green = np.array([148, 242, 178], dtype=float)
        assigner.team_colors[1] = detected_green

        marker_color = assigner.get_draw_color(1)

        self.assertGreater(max(marker_color) - min(marker_color), max(detected_green) - min(detected_green))
        self.assertEqual(assigner.get_draw_color(0), (142, 142, 142))

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

    def test_speed_overlay_suppresses_recent_reappearance_after_interpolated_gap(self) -> None:
        frames = []
        for index in range(41):
            item = player([0, 0, 10, 20], [index * 0.08, 0], 1)
            if index == 15:
                item["interpolated"] = True
            frames.append({1: item})
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = add_speed_and_distance(tracks, fps=25, calibration={"calibrationStatus": "test", "confidence": 0.9})

        self.assertGreater(quality["rejectionReasons"].get("recent_reappearance", 0), 0)
        self.assertFalse(tracks["players"][20][1].get("display_speed_sample"))
        self.assertTrue(tracks["players"][40][1].get("display_speed_sample"))

    def test_speed_overlay_rejects_source_track_fragment_without_stable_streak(self) -> None:
        frames = []
        for index in range(36):
            item = player([0, 0, 10, 20], [index * 0.08, 0], 1)
            item["source_track_id"] = 101 if index < 18 else 202
            frames.append({1: item})
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = add_speed_and_distance(tracks, fps=25, calibration={"calibrationStatus": "test", "confidence": 0.9})

        self.assertGreater(quality["rejectionReasons"].get("source_track_fragment", 0), 0)
        self.assertFalse(any(player_info.get("display_speed_sample") for frame in tracks["players"] for player_info in frame.values()))

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

    def test_black_goalkeeper_is_hardcoded_to_white_team(self) -> None:
        tracks = {
            "players": [
                {
                    1: {**player([10, 0, 20, 30], [18, 20], 1), "team_color": (80, 240, 100)},
                    2: {**player([60, 0, 70, 30], [78, 20], 2), "team_color": (245, 245, 245)},
                    99: {**player([2, 0, 12, 30], [5, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (30, 30, 30)},
                },
                {
                    1: {**player([12, 0, 22, 30], [20, 22], 1), "team_color": (80, 240, 100)},
                    2: {**player([62, 0, 72, 30], [80, 22], 2), "team_color": (245, 245, 245)},
                    99: {**player([3, 0, 13, 30], [6, 22], 1), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (30, 30, 30)},
                },
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(tracks["players"][0][99]["team"], 2)
        self.assertEqual(tracks["players"][1][99]["team"], 2)
        self.assertEqual(quality["assigned"], 1)
        self.assertEqual(quality["items"][0]["reason"], "hardcoded_goalkeeper_color:black")

    def test_persistent_black_goalkeeper_is_assigned_to_white_team(self) -> None:
        frames = []
        for frame_index in range(20):
            frame_players = {
                1: {**player([18, 0, 28, 30], [20, 30], 1), "team_color": (80, 240, 100)},
                2: {**player([28, 0, 38, 30], [30, 35], 1), "team_color": (80, 240, 100)},
                8: {**player([10, 0, 20, 30], [12, 28], 2), "team_color": (245, 245, 245)},
                9: {**player([76, 0, 86, 30], [80, 38], 2), "team_color": (245, 245, 245)},
                25: {
                    **player([2, 0, 10, 30], [5, 30], 1),
                    "role": "goalkeeper",
                    "isGoalkeeper": True,
                    "jersey_color": (30, 30, 30),
                    "team_color_distance": 90.0,
                },
            }
            if frame_index < 2:
                frame_players[34] = {
                    **player([0, 0, 6, 28], [0, 30], 1),
                    "role": "goalkeeper",
                    "isGoalkeeper": True,
                    "jersey_color": (30, 30, 30),
                    "team_color_distance": 95.0,
                }
            frames.append(frame_players)
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual({item["id"] for item in quality["items"]}, {25})
        self.assertEqual(quality["items"][0]["team"], 2)
        self.assertEqual(quality["items"][0]["reason"], "hardcoded_goalkeeper_color:black")
        self.assertEqual(tracks["players"][0][25]["team_color"], (245, 245, 245))
        self.assertNotIn("isGoalkeeper", tracks["players"][0][34])

    def test_stationary_edge_players_are_not_promoted_without_goalkeeper_evidence(self) -> None:
        frames = []
        for _frame_index in range(10):
            frames.append(
                {
                    1: player([2, 0, 12, 30], [5, 30], 1),
                    2: player([78, 0, 88, 30], [82, 30], 2),
                }
            )
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(quality["detected"], 0)
        self.assertEqual(quality["assigned"], 0)
        self.assertFalse(any(player_info.get("isGoalkeeper") for frame in frames for player_info in frame.values()))

    def test_white_player_matching_either_team_kit_is_not_a_goalkeeper_color_outlier(self) -> None:
        frames = []
        for _frame_index in range(10):
            frames.append(
                {
                    1: player([18, 0, 28, 30], [22, 30], 1),
                    8: {
                        **player([2, 0, 12, 30], [5, 30], 1),
                        "jersey_color": (235.0, 235.0, 235.0),
                        "team_color_distance": 92.0,
                        "nearest_color_distance": 8.0,
                        "other_color_distance": 92.0,
                    },
                    9: player([78, 0, 88, 30], [82, 30], 2),
                }
            )
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(quality["detected"], 0)
        self.assertEqual(quality["assigned"], 0)
        self.assertNotIn("isGoalkeeper", tracks["players"][0][8])

    def test_explicit_white_player_is_rejected_by_hardcoded_goalkeeper_kits(self) -> None:
        frames = []
        for _frame_index in range(10):
            frames.append(
                {
                    1: {**player([18, 0, 28, 30], [22, 30], 1), "team_color": (80, 240, 100)},
                    8: {
                        **player([2, 0, 12, 30], [5, 30], 1),
                        "role": "goalkeeper",
                        "isGoalkeeper": True,
                        "jersey_color": (235.0, 235.0, 235.0),
                        "team_color_distance": 92.0,
                    },
                    9: {**player([78, 0, 88, 30], [82, 30], 2), "team_color": (245, 245, 245)},
                }
            )
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(quality["detected"], 0)
        self.assertEqual(quality["assigned"], 0)
        self.assertNotIn("isGoalkeeper", tracks["players"][0][8])

    def test_single_goalkeeper_label_does_not_promote_a_long_lived_field_player(self) -> None:
        frames = []
        for frame_index in range(100):
            field_player = player([2, 0, 12, 30], [5, 30], 1)
            if frame_index == 0:
                field_player["role"] = "goalkeeper"
                field_player["isGoalkeeper"] = True
            frames.append(
                {
                    1: field_player,
                    2: player([78, 0, 88, 30], [82, 30], 2),
                }
            )
        tracks = {
            "players": frames,
            "referees": [{} for _ in frames],
            "ball": [{} for _ in frames],
        }

        quality = assign_goalkeeper_teams(tracks)

        self.assertEqual(quality["detected"], 0)
        self.assertEqual(quality["assigned"], 0)
        self.assertNotIn("isGoalkeeper", tracks["players"][0][1])

    def test_goal_zone_color_outlier_is_not_promoted_without_hardcoded_kit(self) -> None:
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

        self.assertEqual(tracks["players"][0][77]["team"], 2)
        self.assertNotIn("isGoalkeeper", tracks["players"][0][77])
        self.assertEqual(quality["detected"], 0)
        self.assertEqual(quality["assigned"], 0)

    def test_goalkeeper_assignment_is_capped_to_one_per_team(self) -> None:
        tracks = {
            "players": [
                {
                    1: {**player([20, 0, 30, 30], [24, 20], 1), "team_color": (245, 245, 245)},
                    2: {**player([70, 0, 80, 30], [84, 20], 2), "team_color": (80, 240, 100)},
                    90: {**player([2, 0, 12, 30], [5, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (30, 30, 30)},
                    91: {**player([4, 0, 14, 30], [7, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (35, 35, 35)},
                    92: {**player([88, 0, 98, 30], [96, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (40, 100, 225)},
                    93: {**player([60, 0, 70, 30], [55, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (45, 105, 220)},
                },
                {
                    1: {**player([21, 0, 31, 30], [25, 20], 1), "team_color": (245, 245, 245)},
                    2: {**player([71, 0, 81, 30], [85, 20], 2), "team_color": (80, 240, 100)},
                    90: {**player([3, 0, 13, 30], [6, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (30, 30, 30)},
                    91: {**player([5, 0, 15, 30], [8, 20], 1), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (35, 35, 35)},
                    92: {**player([87, 0, 97, 30], [95, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (40, 100, 225)},
                    93: {**player([61, 0, 71, 30], [56, 20], 2), "role": "goalkeeper", "isGoalkeeper": True, "jersey_color": (45, 105, 220)},
                },
            ],
            "referees": [{}, {}],
            "ball": [{}, {}],
        }

        quality = assign_goalkeeper_teams(tracks)
        selected_ids = {item["id"] for item in quality["items"]}
        selected_teams = {item["team"] for item in quality["items"]}

        self.assertLessEqual(quality["assigned"], 2)
        self.assertEqual(selected_ids, {90, 92})
        self.assertEqual(selected_teams, {1, 2})
        self.assertNotEqual(
            tracks["players"][0][90]["team_color"],
            tracks["players"][0][92]["team_color"],
        )
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
            {
                "model": "nvidia/LocateAnything-3B",
                "revision": "c32291ca5e996f5a7a485845b4f57a233936bba0",
                "generationMode": "hybrid",
                "detectionFps": 5,
                "batchSize": 4,
                "framesProcessed": 1,
                "slowRetries": 0,
                "parseFailures": 0,
            },
        )
        self.assertEqual(metrics["version"], 1)
        self.assertIn("quality", metrics)
        self.assertEqual(metrics["match"]["detectedTeamColors"]["sampleCount"], 20)
        self.assertEqual(metrics["inference"]["model"], "nvidia/LocateAnything-3B")


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


class RecordingCv2:
    LINE_AA = 16
    FILLED = -1
    FONT_HERSHEY_SIMPLEX = 0

    def __init__(self) -> None:
        self.ellipses: list[tuple] = []
        self.texts: list[str] = []

    def ellipse(self, _canvas, center, axes, angle, start, end, color, thickness, line_type) -> None:
        self.ellipses.append((center, axes, angle, thickness, start, end, color, line_type))

    def addWeighted(self, _source, _alpha, _destination, _beta, _gamma, _output) -> None:
        return None

    def rectangle(self, _canvas, _top_left, _bottom_right, _color, _thickness, *_args) -> None:
        return None

    def putText(self, _canvas, text, _origin, _font, _scale, _color, _thickness, _line_type) -> None:
        self.texts.append(text)
        return None

    def getTextSize(self, text, _font, _scale, _thickness):
        return (len(text) * 6, 10), 2


if __name__ == "__main__":
    unittest.main()
