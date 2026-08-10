from __future__ import annotations

import importlib
import importlib.util
import os
import platform
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol, Sequence

from .common import bbox_iou, log


DEFAULT_MODEL_ID = "nvidia/LocateAnything-3B"
DEFAULT_MODEL_REVISION = "c32291ca5e996f5a7a485845b4f57a233936bba0"
DEFAULT_PROMPT_CATEGORIES = (
    "soccer player",
    "goalkeeper",
    "association football referee",
    "soccer ball",
)
DETECTION_QUERY = "</c>".join(DEFAULT_PROMPT_CATEGORIES)
DETECTION_PROMPT = (
    "Locate all the instances that matches the following description: "
    + DETECTION_QUERY
    + "."
)
CLASS_IDS = {"player": 0, "goalkeeper": 1, "referee": 2, "ball": 3}
CLASS_NAMES = {class_id: name for name, class_id in CLASS_IDS.items()}
LABEL_ALIASES = {
    "player": {"player", "players", "person", "people", "soccer_player", "soccer_players"},
    "goalkeeper": {"goalkeeper", "goalkeepers", "goalie", "keeper", "gk"},
    "referee": {
        "referee",
        "referees",
        "official",
        "officials",
        "association_football_referee",
    },
    "ball": {"ball", "football", "soccer_ball", "association_football"},
}
REQUIRED_RUNTIME_MODULES = (
    "accelerate",
    "cv2",
    "decord",
    "einops",
    "flash_attn",
    "huggingface_hub",
    "lmdb",
    "peft",
    "PIL",
    "sklearn",
    "supervision",
    "timm",
    "tokenizers",
    "torchvision",
    "transformers",
)
BOX_PATTERN = re.compile(
    r"<ref>\s*(?P<label>.*?)\s*</ref>\s*"
    r"<box><(?P<x1>\d+)><(?P<y1>\d+)><(?P<x2>\d+)><(?P<y2>\d+)></box>",
    re.IGNORECASE | re.DOTALL,
)
NONE_PATTERN = re.compile(r"<box>\s*none\s*</box>", re.IGNORECASE)


class LocateAnythingOutputError(ValueError):
    """Raised when the model answer cannot be safely converted into detections."""


class LocateAnythingRuntimeProtocol(Protocol):
    def predict_batch(self, frames: Sequence[Any], prompt: str) -> list[str]: ...

    def predict_slow(self, frame: Any, prompt: str) -> str: ...


@dataclass(frozen=True)
class ParsedLocateAnythingAnswer:
    detections: list[dict[str, Any]]
    invalid_boxes: int = 0
    unknown_labels: int = 0


def normalize_label(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.strip().lower()).strip("_")


def canonical_label(value: str) -> str | None:
    normalized = normalize_label(value)
    for canonical, aliases in LABEL_ALIASES.items():
        if normalized in aliases:
            return canonical
    return None


def parse_locateanything_answer(answer: str, image_size: tuple[int, int]) -> ParsedLocateAnythingAnswer:
    if not isinstance(answer, str) or not answer.strip():
        raise LocateAnythingOutputError("LocateAnything returned an empty answer.")

    width, height = image_size
    if width <= 0 or height <= 0:
        raise ValueError("image_size must contain positive dimensions")

    matches = list(BOX_PATTERN.finditer(answer))
    none_matches = list(NONE_PATTERN.finditer(answer))
    box_token_count = len(re.findall(r"<box>", answer, flags=re.IGNORECASE))
    if box_token_count == 0 or box_token_count != len(matches) + len(none_matches):
        raise LocateAnythingOutputError("LocateAnything returned malformed box tokens.")
    if none_matches and not matches:
        return ParsedLocateAnythingAnswer(detections=[])

    detections: list[dict[str, Any]] = []
    invalid_boxes = 0
    unknown_labels = 0
    for match in matches:
        label = canonical_label(match.group("label"))
        if label is None:
            unknown_labels += 1
            continue

        normalized_box = [int(match.group(name)) for name in ("x1", "y1", "x2", "y2")]
        x1, y1, x2, y2 = normalized_box
        if not all(0 <= value <= 1000 for value in normalized_box) or x2 <= x1 or y2 <= y1:
            invalid_boxes += 1
            continue

        bbox = [
            x1 / 1000 * width,
            y1 / 1000 * height,
            x2 / 1000 * width,
            y2 / 1000 * height,
        ]
        if bbox[2] - bbox[0] < 1 or bbox[3] - bbox[1] < 1:
            invalid_boxes += 1
            continue
        detections.append({"class_name": label, "bbox": bbox})

    if invalid_boxes and not detections:
        raise LocateAnythingOutputError("LocateAnything returned only invalid coordinates.")

    reconciled = reconcile_and_deduplicate(detections)
    return ParsedLocateAnythingAnswer(
        detections=reconciled,
        invalid_boxes=invalid_boxes,
        unknown_labels=unknown_labels,
    )


def reconcile_and_deduplicate(detections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    goalkeepers = [item for item in detections if item["class_name"] == "goalkeeper"]
    without_duplicate_players = [
        item
        for item in detections
        if item["class_name"] != "player"
        or not any(bbox_iou(item["bbox"], goalkeeper["bbox"]) >= 0.6 for goalkeeper in goalkeepers)
    ]

    deduplicated: list[dict[str, Any]] = []
    for item in without_duplicate_players:
        if any(
            existing["class_name"] == item["class_name"]
            and bbox_iou(existing["bbox"], item["bbox"]) >= 0.85
            for existing in deduplicated
        ):
            continue
        deduplicated.append(item)
    return deduplicated


def inspect_locateanything_runtime(
    *,
    torch_module: Any | None = None,
    module_finder: Callable[[str], Any] = importlib.util.find_spec,
    system_name: str | None = None,
    python_version: tuple[int, int] | None = None,
    minimum_vram_gb: float = 24.0,
    required_gpu_name: str | None = None,
) -> dict[str, Any]:
    current_system = system_name or platform.system()
    current_python = python_version or (sys.version_info.major, sys.version_info.minor)
    expected_gpu_name = (
        required_gpu_name
        if required_gpu_name is not None
        else os.environ.get("ANALYSIS_REQUIRED_GPU_NAME", "")
    ).strip()
    issues: list[str] = []

    if current_python != (3, 11):
        issues.append(
            f"Python 3.11 is required; the configured worker uses {current_python[0]}.{current_python[1]}."
        )
    if current_system != "Linux":
        issues.append(f"Linux is required for the supported LocateAnything GPU worker; found {current_system}.")

    missing_modules = [name for name in REQUIRED_RUNTIME_MODULES if module_finder(name) is None]
    if missing_modules:
        issues.append("Missing Python modules: " + ", ".join(missing_modules) + ".")

    if torch_module is None:
        if module_finder("torch") is None:
            issues.append("Missing Python module: torch.")
        else:
            try:
                import torch as imported_torch

                torch_module = imported_torch
            except Exception as error:
                issues.append(f"PyTorch could not be imported: {error}.")

    torch_version = str(getattr(torch_module, "__version__", "unavailable"))
    cuda_build = getattr(getattr(torch_module, "version", None), "cuda", None)
    cuda_available = bool(
        torch_module is not None
        and hasattr(torch_module, "cuda")
        and torch_module.cuda.is_available()
    )
    gpu_name: str | None = None
    vram_gb = 0.0
    bf16_supported = False
    if not cuda_available:
        issues.append(
            f"A CUDA-enabled PyTorch build and NVIDIA GPU are required; torch={torch_version}, CUDA build={cuda_build}."
        )
    else:
        gpu_name = str(torch_module.cuda.get_device_name(0))
        total_memory = int(torch_module.cuda.get_device_properties(0).total_memory)
        vram_gb = total_memory / 1_000_000_000
        bf16_supported = bool(torch_module.cuda.is_bf16_supported())
        if vram_gb < minimum_vram_gb:
            issues.append(
                f"At least {minimum_vram_gb:g} GB VRAM is required for batch inference; "
                f"{gpu_name} exposes {vram_gb:.1f} GB."
            )
        if not bf16_supported:
            issues.append(f"{gpu_name} does not report BF16 CUDA support.")
        if expected_gpu_name and expected_gpu_name.casefold() not in gpu_name.casefold():
            issues.append(
                f"The deployment requires a GPU matching '{expected_gpu_name}'; CUDA exposed {gpu_name}."
            )

    return {
        "ok": not issues,
        "issues": issues,
        "system": current_system,
        "python": f"{current_python[0]}.{current_python[1]}",
        "missingModules": missing_modules,
        "torch": torch_version,
        "cudaBuild": cuda_build,
        "cudaAvailable": cuda_available,
        "gpu": gpu_name,
        "vramGb": round(vram_gb, 2),
        "bf16Supported": bf16_supported,
        "minimumVramGb": minimum_vram_gb,
        "requiredGpuName": expected_gpu_name or None,
    }


def format_runtime_failure(report: dict[str, Any]) -> str:
    details = " ".join(str(issue) for issue in report.get("issues", []))
    return (
        "LocateAnything runtime preflight failed. "
        + details
        + " Build and run Dockerfile.analysis-gpu on a compatible NVIDIA host."
    )


class LocateAnythingRuntime:
    """Pinned, local-snapshot runtime for NVIDIA LocateAnything batch inference."""

    def __init__(self, model_id: str, revision: str, device: str = "cuda") -> None:
        runtime_report = inspect_locateanything_runtime()
        if not runtime_report["ok"]:
            raise RuntimeError(format_runtime_failure(runtime_report))
        try:
            import torch
            from huggingface_hub import snapshot_download
        except ModuleNotFoundError as error:
            raise RuntimeError(
                f"Missing LocateAnything dependency '{error.name}'. "
                "Install analysis/requirements.txt in the Python 3.11 worker environment."
            ) from error

        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("LocateAnything requires an NVIDIA CUDA GPU; torch.cuda.is_available() is false.")

        snapshot_path = Path(
            snapshot_download(
                repo_id=model_id,
                revision=revision,
                token=os.environ.get("HF_TOKEN") or None,
            )
        ).resolve()
        log(f"LocateAnything snapshot ready: {snapshot_path}")

        snapshot_string = str(snapshot_path)
        if snapshot_string not in sys.path:
            sys.path.insert(0, snapshot_string)
        os.environ["LA_FLASH_MODEL"] = snapshot_string
        os.environ["LA_FLASH_ATTN"] = "la_flash"
        os.environ["LA_FLASH_VISION_ATTN"] = "flash_attention_2"
        os.environ["LA_FLASH_HYBRID_SCHEDULER"] = "pipeline"
        os.environ["LA_FLASH_STRICT_ATTN"] = "1"

        try:
            batch_utils = importlib.import_module("batch_utils")
            self.tokenizer, self.processor, self.model = batch_utils.load()
            self._batch_generate = batch_utils.generate_batch_hybrid
        except (ImportError, AttributeError) as error:
            raise RuntimeError(
                "The pinned LocateAnything snapshot could not load its la_flash batch runtime. "
                "Verify flash-attn and the snapshot batch_utils/kernel_utils files."
            ) from error

        self.torch = torch
        self.device = device
        self.dtype = torch.bfloat16
        torch.manual_seed(0)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(0)

    def predict_batch(self, frames: Sequence[Any], prompt: str) -> list[str]:
        images = [self._to_pil(frame) for frame in frames]
        answers = self._batch_generate(
            [(image, prompt) for image in images],
            temperature=0.0,
            top_p=1.0,
            top_k=None,
            repetition_penalty=1.0,
            max_new_tokens=2048,
            scheduler="pipeline",
            group_size=0,
        )
        return [str(answer) for answer in answers]

    def predict_slow(self, frame: Any, prompt: str) -> str:
        image = self._to_pil(frame)
        messages = [
            {
                "role": "user",
                "content": [
                    {"type": "image", "image": image},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        text = self.processor.py_apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        images, videos = self.processor.process_vision_info(messages)
        inputs = self.processor(text=[text], images=images, videos=videos, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            response = self.model.generate(
                pixel_values=inputs["pixel_values"].to(self.dtype),
                input_ids=inputs["input_ids"],
                attention_mask=inputs["attention_mask"],
                image_grid_hws=inputs.get("image_grid_hws", None),
                tokenizer=self.tokenizer,
                max_new_tokens=8192,
                use_cache=True,
                generation_mode="slow",
                temperature=0.0,
                do_sample=False,
                top_p=1.0,
                repetition_penalty=1.0,
                verbose=False,
            )
        answer = response[0] if isinstance(response, tuple) else response
        return str(answer)

    @staticmethod
    def _to_pil(frame: Any) -> Any:
        from PIL import Image

        return Image.fromarray(frame[:, :, ::-1].copy()).convert("RGB")


class LocateAnythingDetector:
    def __init__(
        self,
        model_id: str = DEFAULT_MODEL_ID,
        revision: str = DEFAULT_MODEL_REVISION,
        runtime: LocateAnythingRuntimeProtocol | None = None,
    ) -> None:
        self.model_id = model_id
        self.revision = revision
        self.runtime = runtime or LocateAnythingRuntime(model_id, revision)
        self.frames_processed = 0
        self.slow_retries = 0
        self.parse_failures = 0
        self.invalid_boxes = 0
        self.unknown_labels = 0

    def detect_batch(self, frames: Sequence[Any]) -> list[list[dict[str, Any]]]:
        if not frames:
            return []
        # The official batch runtime adds the detection prompt around the
        # category query internally. Passing the complete prompt here would
        # duplicate that prefix and degrade the generated structure.
        answers = self.runtime.predict_batch(frames, DETECTION_QUERY)
        if len(answers) != len(frames):
            raise RuntimeError(
                f"LocateAnything returned {len(answers)} answers for a batch of {len(frames)} frames."
            )

        results: list[list[dict[str, Any]]] = []
        for frame, answer in zip(frames, answers):
            self.frames_processed += 1
            height, width = frame.shape[:2]
            try:
                parsed = parse_locateanything_answer(answer, (width, height))
            except LocateAnythingOutputError:
                self.slow_retries += 1
                slow_answer = self.runtime.predict_slow(frame, DETECTION_PROMPT)
                try:
                    parsed = parse_locateanything_answer(slow_answer, (width, height))
                except LocateAnythingOutputError:
                    self.parse_failures += 1
                    results.append([])
                    continue

            self.invalid_boxes += parsed.invalid_boxes
            self.unknown_labels += parsed.unknown_labels
            results.append(parsed.detections)
        return results

    def ensure_acceptable_failure_rate(self, maximum: float = 0.05) -> None:
        if self.frames_processed == 0:
            raise RuntimeError("LocateAnything did not process any sampled frames.")
        failure_rate = self.parse_failures / self.frames_processed
        if failure_rate > maximum:
            raise RuntimeError(
                "LocateAnything parse failure rate exceeded the safety threshold: "
                f"{self.parse_failures}/{self.frames_processed} ({failure_rate:.2%}) > {maximum:.2%}."
            )

    def build_inference_metadata(
        self,
        *,
        detection_fps: float,
        batch_size: int,
        frame_size: tuple[int, int],
    ) -> dict[str, Any]:
        return {
            "model": self.model_id,
            "revision": self.revision,
            "generationMode": "hybrid",
            "detectionFps": round(float(detection_fps), 3),
            "batchSize": int(batch_size),
            "analysisSize": {"width": int(frame_size[0]), "height": int(frame_size[1])},
            "framesProcessed": self.frames_processed,
            "slowRetries": self.slow_retries,
            "parseFailures": self.parse_failures,
            "invalidBoxes": self.invalid_boxes,
            "unknownLabels": self.unknown_labels,
        }
