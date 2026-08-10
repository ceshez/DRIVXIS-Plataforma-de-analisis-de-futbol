#!/usr/bin/env bash
set -euo pipefail

detector="${ANALYSIS_DETECTOR:-yolo}"

if [[ "${detector}" == "locateanything" ]]; then
  echo "[DRIVXIS startup] Preparing pinned LocateAnything snapshot in ${HF_HOME}"
  python analysis/check_runtime.py
  python analysis/cache_model.py
else
  echo "[DRIVXIS startup] YOLO model will be validated/downloaded by the queue worker"
fi

echo "[DRIVXIS startup] Starting ${detector} queue consumer"
exec node scripts/analysis-worker.mjs
