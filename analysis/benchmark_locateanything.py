from __future__ import annotations

import argparse
import json
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

from analysis.pipeline.common import bbox_iou
from analysis.pipeline.locate_anything import (
    DEFAULT_MODEL_ID,
    DEFAULT_MODEL_REVISION,
    LocateAnythingDetector,
)


EVALUATED_LABELS = ("player", "goalkeeper", "referee", "ball")


def update_counts(
    counts: dict[str, dict[str, int]],
    expected: list[dict[str, Any]],
    predicted: list[dict[str, Any]],
    iou_threshold: float = 0.5,
) -> None:
    for label in EVALUATED_LABELS:
        truth_boxes = [item["bbox"] for item in expected if item["label"] == label]
        predicted_boxes = [item["bbox"] for item in predicted if item["class_name"] == label]
        candidates = sorted(
            (
                (bbox_iou(truth_box, predicted_box), truth_index, predicted_index)
                for truth_index, truth_box in enumerate(truth_boxes)
                for predicted_index, predicted_box in enumerate(predicted_boxes)
            ),
            reverse=True,
        )
        matched_truth: set[int] = set()
        matched_predictions: set[int] = set()
        for overlap, truth_index, predicted_index in candidates:
            if overlap < iou_threshold:
                break
            if truth_index in matched_truth or predicted_index in matched_predictions:
                continue
            matched_truth.add(truth_index)
            matched_predictions.add(predicted_index)
        counts[label]["tp"] += len(matched_truth)
        counts[label]["fn"] += len(truth_boxes) - len(matched_truth)
        counts[label]["fp"] += len(predicted_boxes) - len(matched_predictions)


def summarize_counts(counts: dict[str, dict[str, int]]) -> dict[str, Any]:
    classes: dict[str, dict[str, float | int]] = {}
    for label in EVALUATED_LABELS:
        tp = counts[label]["tp"]
        fp = counts[label]["fp"]
        fn = counts[label]["fn"]
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        classes[label] = {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": round(precision, 6),
            "recall": round(recall, 6),
            "f1": round(f1, 6),
        }

    ball_goalkeeper_tp = counts["ball"]["tp"] + counts["goalkeeper"]["tp"]
    ball_goalkeeper_fn = counts["ball"]["fn"] + counts["goalkeeper"]["fn"]
    combined_recall = (
        ball_goalkeeper_tp / (ball_goalkeeper_tp + ball_goalkeeper_fn)
        if ball_goalkeeper_tp + ball_goalkeeper_fn
        else 0.0
    )
    return {"classes": classes, "ballGoalkeeperRecall": round(combined_recall, 6)}


def load_manifest(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    clips = payload.get("clips")
    baseline = payload.get("yoloBaseline")
    if not isinstance(clips, list) or len(clips) != 3:
        raise ValueError("The benchmark manifest must contain exactly three representative clips.")
    if not isinstance(baseline, dict):
        raise ValueError("The benchmark manifest must contain yoloBaseline metrics.")
    for field in ("playerF1", "ballGoalkeeperRecall"):
        value = baseline.get(field)
        if not isinstance(value, (int, float)) or not 0 <= float(value) <= 1:
            raise ValueError(f"yoloBaseline.{field} must be a number between zero and one.")
    return payload


def validate_frame_annotation(annotation: dict[str, Any]) -> None:
    if not isinstance(annotation.get("timestampSeconds"), (int, float)):
        raise ValueError("Every annotated frame requires timestampSeconds.")
    if not isinstance(annotation.get("objects"), list):
        raise ValueError("Every annotated frame requires an objects list.")
    for item in annotation["objects"]:
        if item.get("label") not in EVALUATED_LABELS:
            raise ValueError(f"Unsupported benchmark label: {item.get('label')!r}.")
        bbox = item.get("bbox")
        if (
            not isinstance(bbox, list)
            or len(bbox) != 4
            or not all(isinstance(value, (int, float)) for value in bbox)
            or bbox[2] <= bbox[0]
            or bbox[3] <= bbox[1]
        ):
            raise ValueError(f"Invalid benchmark bbox: {bbox!r}.")


def extract_annotated_frame(
    capture: Any,
    annotation: dict[str, Any],
    cv2: Any,
    max_width: int,
) -> tuple[Any, list[dict[str, Any]]]:
    validate_frame_annotation(annotation)
    capture.set(cv2.CAP_PROP_POS_MSEC, float(annotation["timestampSeconds"]) * 1000)
    ok, frame = capture.read()
    if not ok:
        raise RuntimeError(f"Could not read annotated timestamp {annotation['timestampSeconds']} seconds.")
    height, width = frame.shape[:2]
    scale = min(1.0, max_width / width) if max_width > 0 else 1.0
    if scale < 1:
        frame = cv2.resize(
            frame,
            (max(2, round(width * scale)), max(2, round(height * scale))),
            interpolation=cv2.INTER_AREA,
        )
    objects = [
        {
            "label": item["label"],
            "bbox": [float(value) * scale for value in item["bbox"]],
        }
        for item in annotation["objects"]
    ]
    return frame, objects


def run_benchmark(manifest_path: Path, output_path: Path | None, batch_size: int) -> dict[str, Any]:
    import cv2
    import torch

    manifest = load_manifest(manifest_path)
    max_width = int(os.environ.get("ANALYSIS_MAX_WIDTH", "1920"))
    detector = LocateAnythingDetector(
        model_id=os.environ.get("LOCATEANYTHING_MODEL_ID", DEFAULT_MODEL_ID),
        revision=os.environ.get("LOCATEANYTHING_REVISION", DEFAULT_MODEL_REVISION),
    )
    counts: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    started_at = time.perf_counter()
    torch.cuda.reset_peak_memory_stats()

    for clip in manifest["clips"]:
        video_path = (manifest_path.parent / str(clip.get("video", ""))).resolve()
        if not video_path.is_file():
            raise FileNotFoundError(f"Benchmark clip does not exist: {video_path}")
        annotations = clip.get("frames")
        if not isinstance(annotations, list) or not annotations:
            raise ValueError(f"Benchmark clip {clip.get('name')!r} has no annotated frames.")
        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            raise RuntimeError(f"Could not open benchmark clip: {video_path}")
        try:
            pending_frames: list[Any] = []
            pending_expected: list[list[dict[str, Any]]] = []
            for annotation in annotations:
                frame, expected = extract_annotated_frame(capture, annotation, cv2, max_width)
                pending_frames.append(frame)
                pending_expected.append(expected)
                if len(pending_frames) >= batch_size:
                    predictions = detector.detect_batch(pending_frames)
                    for truth, prediction in zip(pending_expected, predictions):
                        update_counts(counts, truth, prediction)
                    pending_frames = []
                    pending_expected = []
            if pending_frames:
                predictions = detector.detect_batch(pending_frames)
                for truth, prediction in zip(pending_expected, predictions):
                    update_counts(counts, truth, prediction)
        finally:
            capture.release()

    detector.ensure_acceptable_failure_rate()
    elapsed_seconds = time.perf_counter() - started_at
    summary = summarize_counts(counts)
    valid_output_rate = 1 - detector.parse_failures / detector.frames_processed
    baseline = manifest["yoloBaseline"]
    checks = {
        "playerF1WithinTwoPoints": (
            summary["classes"]["player"]["f1"] >= float(baseline["playerF1"]) - 0.02
        ),
        "ballGoalkeeperRecallImprovedFivePoints": (
            summary["ballGoalkeeperRecall"] >= float(baseline["ballGoalkeeperRecall"]) + 0.05
        ),
        "validOutputsAtLeastNinetyNinePercent": valid_output_rate >= 0.99,
    }
    report = {
        "model": detector.model_id,
        "revision": detector.revision,
        "clips": len(manifest["clips"]),
        "frames": detector.frames_processed,
        "elapsedSeconds": round(elapsed_seconds, 3),
        "effectiveInferenceFps": round(detector.frames_processed / max(elapsed_seconds, 0.001), 4),
        "peakVramGb": round(torch.cuda.max_memory_reserved() / (1024**3), 3),
        "validOutputRate": round(valid_output_rate, 6),
        "slowRetries": detector.slow_retries,
        "parseFailures": detector.parse_failures,
        "metrics": summary,
        "yoloBaseline": baseline,
        "checks": checks,
        "passed": all(checks.values()),
    }
    serialized = json.dumps(report, indent=2)
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(serialized, encoding="utf-8")
    print(serialized)
    if not report["passed"]:
        raise SystemExit(2)
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark LocateAnything against labeled football frames.")
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--batch-size", type=int, default=int(os.environ.get("LOCATEANYTHING_BATCH_SIZE", "4")))
    return parser.parse_args()


if __name__ == "__main__":
    arguments = parse_args()
    if arguments.batch_size <= 0:
        raise SystemExit("--batch-size must be greater than zero")
    run_benchmark(arguments.manifest, arguments.output, arguments.batch_size)
