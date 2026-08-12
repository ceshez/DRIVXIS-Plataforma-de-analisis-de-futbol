from __future__ import annotations

import importlib.util
import os
from pathlib import Path
from typing import Any, Callable, Sequence


CLASS_ALIASES = {
    "player": {"player", "players", "person", "people", "footballer", "soccer player"},
    "goalkeeper": {"goalkeeper", "goalkeepers", "goalie", "keeper", "gk"},
    "referee": {"referee", "referees", "official", "officials"},
    "ball": {"ball", "football", "soccer ball", "association football"},
}
DEFAULT_MODEL_PATH = Path("analysis/models/best.pt")


def canonical_class_name(value: Any) -> str | None:
    normalized = str(value).strip().lower().replace("_", " ").replace("-", " ")
    normalized = " ".join(normalized.split())
    for canonical, aliases in CLASS_ALIASES.items():
        if normalized in aliases:
            return canonical
    return None


def _to_numpy(value: Any, np: Any) -> Any:
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "numpy"):
        return value.numpy()
    return np.asarray(value)


class YoloDetector:
    def __init__(
        self,
        model_path: Path | str = DEFAULT_MODEL_PATH,
        *,
        model: Any | None = None,
        device: str | None = None,
        confidence: float | None = None,
        image_size: int | None = None,
    ) -> None:
        import numpy as np

        self.np = np
        self.model_path = Path(model_path)
        self.confidence = float(confidence if confidence is not None else os.getenv("YOLO_CONFIDENCE", "0.1"))
        self.image_size = int(image_size if image_size is not None else os.getenv("YOLO_IMAGE_SIZE", "640"))
        self.fallback_image_size = int(os.getenv("YOLO_FALLBACK_IMAGE_SIZE", "1280"))
        self.sparse_player_threshold = max(1, int(os.getenv("YOLO_SPARSE_PLAYER_THRESHOLD", "8")))
        self.sparse_player_max_height_ratio = float(os.getenv("YOLO_SPARSE_PLAYER_MAX_HEIGHT_RATIO", "0.22"))
        self.process_every_frame = os.getenv("YOLO_PROCESS_EVERY_FRAME", "true").strip().lower() not in {
            "0",
            "false",
            "no",
            "off",
        }
        self.device = device or os.getenv("YOLO_DEVICE") or self._default_device()
        self.frames_processed = 0
        self.fallback_frames = 0

        if model is None:
            if not self.model_path.exists():
                raise FileNotFoundError(f"YOLO model does not exist: {self.model_path}")
            from ultralytics import YOLO

            model = YOLO(str(self.model_path))
        self.model = model
        self.class_names = self._read_class_names(getattr(model, "names", {}))
        present_classes = set(self.class_names.values())
        missing = {"player", "ball"} - present_classes
        if missing:
            raise RuntimeError(
                "YOLO model is missing required classes: " + ", ".join(sorted(missing))
            )

    @staticmethod
    def _default_device() -> str:
        try:
            import torch

            return "0" if torch.cuda.is_available() else "cpu"
        except Exception:
            return "cpu"

    @staticmethod
    def _read_class_names(names: Any) -> dict[int, str]:
        items = names.items() if isinstance(names, dict) else enumerate(names or [])
        mapped: dict[int, str] = {}
        for class_id, name in items:
            canonical = canonical_class_name(name)
            if canonical:
                mapped[int(class_id)] = canonical
        return mapped

    def detect_batch(self, frames: Sequence[Any]) -> list[list[dict[str, Any]]]:
        return self.detect_batch_with_fallback(frames)

    def detect_batch_with_fallback(
        self,
        frames: Sequence[Any],
        fallback_frames: Sequence[Any] | None = None,
    ) -> list[list[dict[str, Any]]]:
        if not frames:
            return []
        parsed_results = self._parse_results(self._predict(frames, self.image_size), len(frames))

        if self.fallback_image_size > self.image_size:
            sparse_indices = [
                index
                for index, detections in enumerate(parsed_results)
                if self._needs_fallback(detections, frames[index])
            ]
            if sparse_indices:
                candidate_frames = fallback_frames if fallback_frames is not None else frames
                sparse_frames = [candidate_frames[index] for index in sparse_indices]
                fallback_results = self._parse_results(
                    self._predict(sparse_frames, self.fallback_image_size),
                    len(sparse_frames),
                )
                for sparse_position, (index, fallback_detections) in enumerate(
                    zip(sparse_indices, fallback_results)
                ):
                    if fallback_frames is not None:
                        fallback_detections = self._scale_detections_to_frame(
                            fallback_detections,
                            source_shape=sparse_frames[sparse_position].shape,
                            target_shape=frames[index].shape,
                        )
                    if self._player_detection_count(fallback_detections) > self._player_detection_count(
                        parsed_results[index]
                    ):
                        parsed_results[index] = fallback_detections
                        self.fallback_frames += 1

        self.frames_processed += len(frames)
        return parsed_results

    def _predict(self, frames: Sequence[Any], image_size: int) -> list[Any]:
        results = list(
            self.model.predict(
                source=list(frames),
                conf=self.confidence,
                imgsz=image_size,
                device=self.device,
                verbose=False,
            )
        )
        if len(results) != len(frames):
            raise RuntimeError(
                f"YOLO returned {len(results)} results for a batch of {len(frames)} frames."
            )
        return results

    def _parse_results(self, results: Sequence[Any], expected_count: int) -> list[list[dict[str, Any]]]:
        if len(results) != expected_count:
            raise RuntimeError(
                f"YOLO returned {len(results)} parsed results for a batch of {expected_count} frames."
            )

        parsed_results: list[list[dict[str, Any]]] = []
        for result in results:
            boxes = getattr(result, "boxes", None)
            if boxes is None:
                parsed_results.append([])
                continue
            xyxy = _to_numpy(getattr(boxes, "xyxy", []), self.np).reshape((-1, 4))
            class_ids = _to_numpy(getattr(boxes, "cls", []), self.np).reshape((-1,))
            confidences = _to_numpy(getattr(boxes, "conf", []), self.np).reshape((-1,))
            detections: list[dict[str, Any]] = []
            for bbox, class_id, score in zip(xyxy, class_ids, confidences):
                class_name = self.class_names.get(int(class_id))
                if not class_name:
                    continue
                detections.append(
                    {
                        "class_name": class_name,
                        "bbox": [float(value) for value in bbox.tolist()],
                        "confidence": float(score),
                    }
                )
            parsed_results.append(detections)
        return parsed_results

    @staticmethod
    def _player_detection_count(detections: Sequence[dict[str, Any]]) -> int:
        return sum(1 for item in detections if item.get("class_name") in {"player", "goalkeeper"})

    def _needs_fallback(self, detections: Sequence[dict[str, Any]], frame: Any) -> bool:
        player_detections = [
            item for item in detections if item.get("class_name") in {"player", "goalkeeper"}
        ]
        if len(player_detections) >= self.sparse_player_threshold:
            return False
        if not player_detections:
            return True
        frame_height = max(1, int(frame.shape[0]))
        largest_height = max(
            max(0.0, float(item["bbox"][3]) - float(item["bbox"][1]))
            for item in player_detections
        )
        return largest_height / frame_height <= self.sparse_player_max_height_ratio

    @staticmethod
    def _scale_detections_to_frame(
        detections: list[dict[str, Any]],
        *,
        source_shape: tuple[int, ...],
        target_shape: tuple[int, ...],
    ) -> list[dict[str, Any]]:
        source_height, source_width = source_shape[:2]
        target_height, target_width = target_shape[:2]
        if source_width == target_width and source_height == target_height:
            return detections
        scale_x = target_width / max(1, source_width)
        scale_y = target_height / max(1, source_height)
        scaled: list[dict[str, Any]] = []
        for detection in detections:
            x1, y1, x2, y2 = detection["bbox"]
            scaled.append(
                {
                    **detection,
                    "bbox": [x1 * scale_x, y1 * scale_y, x2 * scale_x, y2 * scale_y],
                }
            )
        return scaled

    def ensure_acceptable_failure_rate(self) -> None:
        return None

    def build_inference_metadata(
        self,
        *,
        detection_fps: float,
        batch_size: int,
        frame_size: tuple[int, int],
    ) -> dict[str, Any]:
        model_format = "openvino" if self.model_path.is_dir() else self.model_path.suffix.lower().lstrip(".") or "unknown"
        return {
            "detector": "yolo",
            "model": self.model_path.name,
            "revision": "local-or-r2",
            "generationMode": "object-detection",
            "format": model_format,
            "device": self.device,
            "detectionFps": float(detection_fps),
            "batchSize": int(batch_size),
            "analysisSize": {"width": int(frame_size[0]), "height": int(frame_size[1])},
            "framesProcessed": self.frames_processed,
            "fallbackImageSize": self.fallback_image_size,
            "fallbackFrames": self.fallback_frames,
            "slowRetries": 0,
            "parseFailures": 0,
        }


def inspect_yolo_runtime(
    *,
    model_path: Path | str = DEFAULT_MODEL_PATH,
    module_finder: Callable[[str], Any] = importlib.util.find_spec,
    torch_module: Any | None = None,
) -> dict[str, Any]:
    path = Path(model_path)
    required_modules = ("cv2", "numpy", "sklearn", "supervision", "torch", "ultralytics")
    missing_modules = [name for name in required_modules if module_finder(name) is None]
    issues = [f"Missing Python dependency: {name}" for name in missing_modules]
    if not path.exists():
        issues.append(f"YOLO model not found: {path}")

    if torch_module is None and "torch" not in missing_modules:
        import torch as torch_module
    cuda_available = bool(torch_module and torch_module.cuda.is_available())
    device = "cuda" if cuda_available else "cpu"
    return {
        "ok": not issues,
        "detector": "yolo",
        "modelPath": str(path),
        "device": device,
        "torch": getattr(torch_module, "__version__", None),
        "issues": issues,
    }


def format_yolo_runtime_failure(report: dict[str, Any]) -> str:
    issues = report.get("issues") or ["Unknown YOLO runtime error."]
    return "YOLO runtime is not ready:\n- " + "\n- ".join(str(issue) for issue in issues)
