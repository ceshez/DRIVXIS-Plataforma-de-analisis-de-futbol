#!/usr/bin/env bash
set -euo pipefail

echo "[DRIVXIS Sandbox] Synchronizing Node and Prisma dependencies"
npm install --omit=dev --no-audit --no-fund
npx prisma generate

echo "[DRIVXIS Sandbox] Synchronizing Python dependencies"
"${PYTHON_BIN:-.venv-analysis/bin/python}" -m pip install \
  --disable-pip-version-check \
  --no-input \
  -r analysis/requirements.txt

mkdir -p "${LOCAL_STORAGE_ROOT:-/tmp/drivxis/uploads}" "${ANALYSIS_STORAGE_ROOT:-/tmp/drivxis/analysis}"

echo "[DRIVXIS Sandbox] Processing one queued analysis job"
exec node scripts/analysis-worker.mjs --once
