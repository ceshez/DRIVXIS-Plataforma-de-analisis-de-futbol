# DRIVXIS Analysis Engine

This folder adapts `abdullahtarek/football_analysis` into a CLI that DRIVXIS can run from a queue worker.

## Setup

1. Create a dedicated virtual environment for the worker.

Recommended on Windows:

```bash
py -3.11 -m venv .venv-analysis
```

If Python 3.11 is not installed yet, Python 3.12 is also acceptable for local tests. Avoid Python 3.14 for this pipeline until the vision stack is validated there.

2. Install dependencies into that environment:

```bash
.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
.venv-analysis\Scripts\python.exe -m pip install -r analysis/requirements.txt
```

3. Confirm the trained YOLO model exists at:

```bash
analysis/models/best.pt
```

4. Point the worker to the virtualenv interpreter in `.env`:

```env
PYTHON_BIN=".venv-analysis/Scripts/python.exe"
LOCAL_STORAGE_ROOT=".drivxis/uploads"
ANALYSIS_STORAGE_ROOT=".drivxis/analysis"
ANALYSIS_MODEL_PATH="analysis/models/best.pt"
```

Cloudflare R2 / S3 credentials are not required for the first local version. The upload route and worker already support local storage-only execution.

## CLI

```bash
.venv-analysis\Scripts\python.exe analysis/run_analysis.py --input path/to/source.mp4 --output path/to/annotated.mp4 --metrics-json path/to/metrics.json --model analysis/models/best.pt
```

The CLI writes an annotated MP4 plus a metrics JSON payload that follows the DRIVXIS v1 contract.

## Smoke Test

Use a short local MP4 from `.drivxis/uploads` or any accessible path:

```bash
.venv-analysis\Scripts\python.exe analysis/run_analysis.py --input C:\ruta\partido.mp4 --output .drivxis\analysis\smoke-test\annotated.mp4 --metrics-json .drivxis\analysis\smoke-test\metrics.json --model analysis/models/best.pt
```

Expected outputs:

- `.drivxis/analysis/smoke-test/annotated.mp4`
- `.drivxis/analysis/smoke-test/metrics.json`

The model must expose classes compatible with:

- `player` or `person`
- `ball` or `football`
- optionally `goalkeeper`, `goalie`, `keeper`, `gk`
- optionally `referee`, `ref`, `official`
