from __future__ import annotations

import unittest
from collections import defaultdict
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from analysis.benchmark_locateanything import summarize_counts, update_counts
from analysis.pipeline.locate_anything import (
    LocateAnythingDetector,
    LocateAnythingOutputError,
    inspect_locateanything_runtime,
    parse_locateanything_answer,
)
from analysis.pipeline.tracker import interpolate_track_gaps, process_video_pass, should_sample_frame


class FakeRuntime:
    def __init__(self, batch_answers: list[str], slow_answer: str = "<box>none</box>") -> None:
        self.batch_answers = batch_answers
        self.slow_answer = slow_answer
        self.slow_calls = 0

    def predict_batch(self, frames, prompt: str) -> list[str]:
        self.prompt = prompt
        return self.batch_answers

    def predict_slow(self, frame, prompt: str) -> str:
        self.slow_calls += 1
        return self.slow_answer


class LocateAnythingParserTests(unittest.TestCase):
    def test_parses_multiple_classes_and_pixel_coordinates(self) -> None:
        parsed = parse_locateanything_answer(
            """
            <ref>soccer player</ref><box><100><200><300><800></box>
            <ref>association football referee</ref><box><400><250><500><800></box>
            <ref>soccer ball</ref><box><600><500><620><530></box>
            """,
            (1920, 1080),
        )

        self.assertEqual([item["class_name"] for item in parsed.detections], ["player", "referee", "ball"])
        self.assertEqual(parsed.detections[0]["bbox"], [192.0, 216.0, 576.0, 864.0])

    def test_accepts_no_object_answer(self) -> None:
        parsed = parse_locateanything_answer("<box>none</box>", (1280, 720))
        self.assertEqual(parsed.detections, [])

    def test_ignores_unknown_labels_without_corrupting_known_boxes(self) -> None:
        parsed = parse_locateanything_answer(
            "<ref>coach</ref><box><10><10><100><200></box>"
            "<ref>goalkeeper</ref><box><200><100><300><700></box>",
            (1000, 1000),
        )
        self.assertEqual(parsed.unknown_labels, 1)
        self.assertEqual([item["class_name"] for item in parsed.detections], ["goalkeeper"])

    def test_rejects_malformed_or_invalid_boxes(self) -> None:
        with self.assertRaises(LocateAnythingOutputError):
            parse_locateanything_answer("player: 10,20,30,40", (1280, 720))
        with self.assertRaises(LocateAnythingOutputError):
            parse_locateanything_answer(
                "<ref>player</ref><box><300><200><100><900></box>",
                (1280, 720),
            )

    def test_reconciles_goalkeeper_and_duplicate_player_boxes(self) -> None:
        parsed = parse_locateanything_answer(
            "<ref>player</ref><box><100><100><300><900></box>"
            "<ref>player</ref><box><102><102><302><902></box>"
            "<ref>goalkeeper</ref><box><101><101><301><901></box>",
            (1000, 1000),
        )
        self.assertEqual(len(parsed.detections), 1)
        self.assertEqual(parsed.detections[0]["class_name"], "goalkeeper")

    def test_benchmark_matches_boxes_by_class_and_iou(self) -> None:
        counts = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
        update_counts(
            counts,
            [
                {"label": "player", "bbox": [0, 0, 20, 40]},
                {"label": "ball", "bbox": [50, 50, 56, 56]},
            ],
            [
                {"class_name": "player", "bbox": [1, 1, 21, 41]},
                {"class_name": "player", "bbox": [70, 10, 90, 50]},
            ],
        )
        summary = summarize_counts(counts)
        self.assertEqual(summary["classes"]["player"]["tp"], 1)
        self.assertEqual(summary["classes"]["player"]["fp"], 1)
        self.assertEqual(summary["classes"]["ball"]["fn"], 1)


class LocateAnythingDetectorTests(unittest.TestCase):
    def test_retries_malformed_batch_answer_in_slow_mode(self) -> None:
        runtime = FakeRuntime(
            ["malformed"],
            "<ref>soccer player</ref><box><100><100><300><900></box>",
        )
        detector = LocateAnythingDetector(runtime=runtime)
        frame = np.zeros((100, 200, 3), dtype=np.uint8)

        detections = detector.detect_batch([frame])

        self.assertEqual(runtime.slow_calls, 1)
        self.assertEqual(
            runtime.prompt,
            "soccer player</c>goalkeeper</c>association football referee</c>soccer ball",
        )
        self.assertEqual(detector.slow_retries, 1)
        self.assertEqual(detector.parse_failures, 0)
        self.assertEqual(detections[0][0]["class_name"], "player")

    def test_fails_safety_gate_when_more_than_five_percent_are_unparseable(self) -> None:
        runtime = FakeRuntime(["malformed", "malformed"], slow_answer="still malformed")
        detector = LocateAnythingDetector(runtime=runtime)
        frames = [np.zeros((10, 10, 3), dtype=np.uint8) for _ in range(2)]

        self.assertEqual(detector.detect_batch(frames), [[], []])
        with self.assertRaises(RuntimeError):
            detector.ensure_acceptable_failure_rate()


class LocateAnythingRuntimeRequirementTests(unittest.TestCase):
    def test_reports_all_incompatible_local_runtime_requirements(self) -> None:
        torch_module = SimpleNamespace(
            __version__="2.11.0+cpu",
            version=SimpleNamespace(cuda=None),
            cuda=SimpleNamespace(is_available=lambda: False),
        )

        report = inspect_locateanything_runtime(
            torch_module=torch_module,
            module_finder=lambda _name: None,
            system_name="Windows",
            python_version=(3, 12),
        )

        self.assertFalse(report["ok"])
        self.assertTrue(any("Python 3.11" in issue for issue in report["issues"]))
        self.assertTrue(any("Linux" in issue for issue in report["issues"]))
        self.assertTrue(any("huggingface_hub" in issue for issue in report["issues"]))
        self.assertTrue(any("CUDA" in issue for issue in report["issues"]))

    def test_accepts_linux_cuda_bf16_runtime_with_sufficient_vram(self) -> None:
        cuda = SimpleNamespace(
            is_available=lambda: True,
            is_bf16_supported=lambda: True,
            get_device_name=lambda _index: "NVIDIA test GPU",
            get_device_properties=lambda _index: SimpleNamespace(total_memory=25_000_000_000),
        )
        torch_module = SimpleNamespace(
            __version__="2.7.1+cu128",
            version=SimpleNamespace(cuda="12.8"),
            cuda=cuda,
        )

        report = inspect_locateanything_runtime(
            torch_module=torch_module,
            module_finder=lambda _name: object(),
            system_name="Linux",
            python_version=(3, 11),
            required_gpu_name="",
        )

        self.assertTrue(report["ok"])
        self.assertEqual(report["gpu"], "NVIDIA test GPU")

    def test_rejects_a_non_h100_gpu_when_deployment_requires_h100(self) -> None:
        cuda = SimpleNamespace(
            is_available=lambda: True,
            is_bf16_supported=lambda: True,
            get_device_name=lambda _index: "NVIDIA A100-SXM4-80GB",
            get_device_properties=lambda _index: SimpleNamespace(total_memory=80_000_000_000),
        )
        torch_module = SimpleNamespace(
            __version__="2.7.1+cu128",
            version=SimpleNamespace(cuda="12.8"),
            cuda=cuda,
        )

        report = inspect_locateanything_runtime(
            torch_module=torch_module,
            module_finder=lambda _name: object(),
            system_name="Linux",
            python_version=(3, 11),
            required_gpu_name="H100",
        )

        self.assertFalse(report["ok"])
        self.assertTrue(any("H100" in issue for issue in report["issues"]))
        self.assertEqual(report["requiredGpuName"], "H100")


class LocateAnythingTemporalTests(unittest.TestCase):
    def test_samples_twenty_five_fps_source_at_exactly_five_fps(self) -> None:
        selected: list[int] = []
        last_slot = -1
        for frame_index in range(25):
            should_sample, slot = should_sample_frame(frame_index, 25.0, 5.0, last_slot)
            if should_sample:
                selected.append(frame_index)
                last_slot = slot
        self.assertEqual(selected, [0, 5, 10, 15, 20])

    def test_interpolates_only_between_confirmed_observations_within_limit(self) -> None:
        frames = [{} for _ in range(12)]
        frames[0][7] = {"bbox": [0.0, 0.0, 10.0, 20.0], "team": 1}
        frames[5][7] = {"bbox": [10.0, 10.0, 20.0, 30.0], "team": 1}
        frames[11][7] = {"bbox": [50.0, 50.0, 60.0, 70.0], "team": 1}

        interpolate_track_gaps(frames, fps=25.0, max_gap_seconds=0.2)

        self.assertEqual(frames[1][7]["bbox"], [2.0, 2.0, 12.0, 22.0])
        self.assertTrue(frames[4][7]["interpolated"])
        self.assertNotIn(7, frames[6])
        self.assertNotIn(7, frames[10])

    def test_pipeline_uses_five_fps_backend_and_preserves_full_duration(self) -> None:
        detector = FakeDetector()
        frames = [np.zeros((80, 100, 3), dtype=np.uint8) for _ in range(25)]
        fake_cv2 = FakeCv2(frames)
        fake_sv = SimpleNamespace(Detections=FakeDetections, ByteTrack=FakeByteTrack)
        deps = {"cv2": fake_cv2, "np": np, "sv": fake_sv, "KMeans": object}

        with (
            patch("analysis.pipeline.tracker.CameraMovementEstimator", FakeCameraMovementEstimator),
            patch("analysis.pipeline.tracker.TeamAssigner.from_match_info", return_value=FakeAssigner()),
            patch("analysis.pipeline.tracker.transform_position", side_effect=lambda point, *_args: list(point)),
        ):
            result = process_video_pass(
                input_path=SimpleNamespace(__str__=lambda _self: "fake.mp4"),
                model_id="nvidia/LocateAnything-3B",
                model_revision="pinned",
                detection_fps=5,
                batch_size=4,
                video_info={"frameCount": 25, "frameSize": (100, 80), "fps": 25},
                calibration={},
                match_info={},
                deps=deps,
                detector=detector,
            )

        self.assertEqual(detector.batch_sizes, [4, 1])
        self.assertEqual(result["frameCount"], 25)
        self.assertEqual(len(result["tracks"]["players"]), 25)
        self.assertTrue(result["tracks"]["players"][1][1]["interpolated"])
        self.assertTrue(result["tracks"]["ball"][1][1]["interpolated"])
        self.assertNotIn(1, result["tracks"]["players"][24])
        self.assertEqual(result["inference"]["framesProcessed"], 5)


class FakeDetector:
    def __init__(self) -> None:
        self.batch_sizes: list[int] = []
        self.frames_processed = 0

    def detect_batch(self, frames):
        self.batch_sizes.append(len(frames))
        self.frames_processed += len(frames)
        return [
            [
                {"class_name": "player", "bbox": [10.0, 10.0, 30.0, 70.0]},
                {"class_name": "ball", "bbox": [40.0, 50.0, 45.0, 55.0]},
            ]
            for _frame in frames
        ]

    def ensure_acceptable_failure_rate(self) -> None:
        return None

    def build_inference_metadata(self, **_kwargs):
        return {
            "model": "nvidia/LocateAnything-3B",
            "revision": "pinned",
            "generationMode": "hybrid",
            "detectionFps": 5,
            "batchSize": 4,
            "framesProcessed": self.frames_processed,
            "slowRetries": 0,
            "parseFailures": 0,
        }


class FakeDetections:
    def __init__(self, xyxy, confidence, class_id, tracker_id=None) -> None:
        self.xyxy = xyxy
        self.confidence = confidence
        self.class_id = class_id
        self.tracker_id = tracker_id


class FakeByteTrack:
    def __init__(self, **_kwargs) -> None:
        pass

    def update_with_detections(self, detections):
        return FakeDetections(
            detections.xyxy,
            detections.confidence,
            detections.class_id,
            np.arange(1, len(detections.xyxy) + 1),
        )


class FakeCapture:
    def __init__(self, frames) -> None:
        self.frames = frames
        self.index = 0

    def isOpened(self) -> bool:
        return True

    def read(self):
        if self.index >= len(self.frames):
            return False, None
        frame = self.frames[self.index]
        self.index += 1
        return True, frame.copy()

    def release(self) -> None:
        return None


class FakeCv2:
    INTER_AREA = 3

    def __init__(self, frames) -> None:
        self.frames = frames

    def VideoCapture(self, _path):
        return FakeCapture(self.frames)


class FakeCameraMovementEstimator:
    def __init__(self, _frame, _deps) -> None:
        pass

    def update(self, _frame):
        return [0.0, 0.0]


class FakeAssigner:
    color_anchors = {}
    kmeans = object()

    def mark_contaminated_tracks(self, _players) -> None:
        return None

    def collect_samples(self, _frame, _players) -> None:
        return None

    def get_player_team_info(self, _frame, _bbox, _player_id):
        return {"team": 1}

    def get_draw_color(self, _team):
        return (0, 0, 255)

    def get_detected_colors(self):
        return {}


if __name__ == "__main__":
    unittest.main()
