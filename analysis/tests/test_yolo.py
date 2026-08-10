from __future__ import annotations

import unittest
from tempfile import TemporaryDirectory
from pathlib import Path
from types import SimpleNamespace

import numpy as np

from analysis.pipeline.yolo import YoloDetector, inspect_yolo_runtime


class ArrayValue:
    def __init__(self, value) -> None:
        self.value = np.asarray(value)

    def cpu(self):
        return self

    def numpy(self):
        return self.value


class FakeYoloModel:
    names = {0: "player", 1: "ball", 2: "goalkeeper", 3: "referee", 4: "coach"}

    def __init__(self) -> None:
        self.calls = []

    def predict(self, source, **kwargs):
        self.calls.append((source, kwargs))
        boxes = SimpleNamespace(
            xyxy=ArrayValue([[1, 2, 31, 62], [40, 50, 46, 57], [60, 10, 90, 65], [3, 4, 8, 9]]),
            cls=ArrayValue([0, 1, 2, 4]),
            conf=ArrayValue([0.91, 0.72, 0.88, 0.99]),
        )
        return [SimpleNamespace(boxes=boxes) for _frame in source]


class YoloDetectorTests(unittest.TestCase):
    def test_normalizes_supported_classes_and_keeps_real_confidence(self) -> None:
        model = FakeYoloModel()
        detector = YoloDetector(Path("analysis/models/best.pt"), model=model, device="cpu")

        results = detector.detect_batch([np.zeros((80, 100, 3), dtype=np.uint8)])

        self.assertEqual([item["class_name"] for item in results[0]], ["player", "ball", "goalkeeper"])
        self.assertAlmostEqual(results[0][0]["confidence"], 0.91)
        self.assertEqual(model.calls[0][1]["device"], "cpu")

        metadata = detector.build_inference_metadata(
            detection_fps=5,
            batch_size=4,
            frame_size=(100, 80),
        )
        self.assertEqual(metadata["detector"], "yolo")
        self.assertEqual(metadata["format"], "pt")
        self.assertEqual(metadata["framesProcessed"], 1)

    def test_runtime_preflight_accepts_cpu_and_existing_model(self) -> None:
        with TemporaryDirectory() as directory:
            model_path = Path(directory) / "best.onnx"
            model_path.write_bytes(b"test-model")
            report = inspect_yolo_runtime(
                model_path=model_path,
                module_finder=lambda _name: object(),
                torch_module=SimpleNamespace(
                    __version__="2.11.0+cpu",
                    cuda=SimpleNamespace(is_available=lambda: False),
                ),
            )

        self.assertTrue(report["ok"])
        self.assertEqual(report["device"], "cpu")


if __name__ == "__main__":
    unittest.main()
