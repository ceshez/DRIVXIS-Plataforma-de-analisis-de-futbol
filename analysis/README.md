# DRIVXIS Analysis Engine

The analysis pipeline uses YOLO by default and keeps ByteTrack, team assignment, goalkeepers, possession, speed, distance, annotation, and metrics v1 independent from the selected detector.

## Local YOLO setup

```powershell
python -m venv .venv-analysis
.\.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
.\.venv-analysis\Scripts\python.exe -m pip install -r analysis\requirements.txt
```

Configure `.env`:

```env
PYTHON_BIN=".venv-analysis/Scripts/python.exe"
ANALYSIS_AUTO_START="true"
ANALYSIS_DETECTOR="yolo"
ANALYSIS_MODEL_PATH="analysis/models/best.onnx"
ANALYSIS_DETECTION_FPS="5"
ANALYSIS_BATCH_SIZE="4"
ANALYSIS_MAX_WIDTH="1280"
YOLO_DEVICE="cpu"
```

Run a preflight and one queue iteration:

```powershell
.\.venv-analysis\Scripts\python.exe analysis\check_runtime.py
npm run analysis:worker -- --once
```

## Export `best.pt` to ONNX

```powershell
.\.venv-analysis\Scripts\python.exe -m pip install onnx onnxslim onnxruntime
.\.venv-analysis\Scripts\python.exe -c "from ultralytics import YOLO; YOLO(r'analysis/models/best.pt').export(format='onnx', imgsz=640, dynamic=True, simplify=True, opset=17)"
```

The generated `analysis/models/best.onnx` is intentionally ignored by Git. Upload it to R2 as `models/best.onnx`; the deployed worker downloads it once into `/models/best.onnx` using `ANALYSIS_MODEL_OBJECT_KEY`.

## CPU production worker

```bash
cp deploy/analysis-worker.env.example deploy/analysis-worker.env
docker compose --env-file deploy/analysis-worker.env -f compose.analysis-worker.yml up -d --build
docker compose --env-file deploy/analysis-worker.env -f compose.analysis-worker.yml logs -f worker
```

The worker exposes no inbound port. It needs outbound access to PostgreSQL and R2. Keep `ANALYSIS_AUTO_START=false` in the deployed web application.

## Optional LocateAnything research worker

Set `ANALYSIS_DETECTOR=locateanything` and use `compose.analysis-gpu.yml`. This backend requires Linux, Python 3.11, CUDA/BF16, and at least 24 GB VRAM. The `nvidia/LocateAnything-3B` license allows research/evaluation only; do not use it commercially without separate permission from NVIDIA.

```bash
cp deploy/analysis-gpu.env.example deploy/analysis-gpu.env
docker compose --env-file deploy/analysis-gpu.env -f compose.analysis-gpu.yml up -d --build
```

## Direct smoke test

```powershell
.\.venv-analysis\Scripts\python.exe analysis\run_analysis.py `
  --input "C:\video\clip.mp4" `
  --output ".drivxis\analysis\smoke-test\processed.mp4" `
  --metrics-json ".drivxis\analysis\smoke-test\metrics.json" `
  --detector yolo `
  --model "analysis\models\best.onnx" `
  --detection-fps 5 `
  --batch-size 4
```
