from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from analysis.pipeline.locate_anything import format_runtime_failure, inspect_locateanything_runtime
from analysis.pipeline.yolo import DEFAULT_MODEL_PATH, format_yolo_runtime_failure, inspect_yolo_runtime


def main() -> int:
    detector = os.environ.get("ANALYSIS_DETECTOR", "yolo").strip().lower()
    if detector == "yolo":
        report = inspect_yolo_runtime(
            model_path=Path(os.environ.get("ANALYSIS_MODEL_PATH", str(DEFAULT_MODEL_PATH)))
        )
        format_failure = format_yolo_runtime_failure
    elif detector == "locateanything":
        report = inspect_locateanything_runtime()
        format_failure = format_runtime_failure
    else:
        print(f"Unsupported ANALYSIS_DETECTOR: {detector}", file=sys.stderr, flush=True)
        return 1
    print(json.dumps(report, ensure_ascii=False), flush=True)
    if report["ok"]:
        return 0
    print(format_failure(report), file=sys.stderr, flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
