# Requisitos del modelo de analisis

## Backend predeterminado: YOLO

DRIVXIS usa YOLO exportado a ONNX como detector desplegable predeterminado. El worker funciona en CPU o GPU y no guarda el modelo en Git.

```env
ANALYSIS_DETECTOR="yolo"
ANALYSIS_MODEL_PATH="/models/best.onnx"
ANALYSIS_MODEL_OBJECT_KEY="models/best.onnx"
ANALYSIS_DETECTION_FPS="5"
ANALYSIS_BATCH_SIZE="4"
ANALYSIS_MAX_WIDTH="1280"
ANALYSIS_AUTO_START="false"
```

El archivo se conserva en un volumen persistente. Si no existe, el worker lo descarga desde R2 mediante `ANALYSIS_MODEL_OBJECT_KEY` o desde `ANALYSIS_MODEL_URL`. PostgreSQL y Cloudflare R2 deben ser accesibles desde el contenedor.

```bash
docker build -f Dockerfile.analysis-worker -t drivxis-analysis-worker:yolo-cpu .
```

## Backend opcional: LocateAnything

`nvidia/LocateAnything-3B` se conserva exclusivamente para investigacion/evaluacion no comercial. Su licencia publica no permite el uso comercial sin una autorizacion distinta de NVIDIA.

```env
ANALYSIS_DETECTOR="locateanything"
LOCATEANYTHING_MODEL_ID="nvidia/LocateAnything-3B"
LOCATEANYTHING_REVISION="c32291ca5e996f5a7a485845b4f57a233936bba0"
```

Requiere Linux, Python 3.11, NVIDIA CUDA/BF16, al menos 24 GB de VRAM y espacio persistente para `HF_HOME`. Se despliega con `Dockerfile.analysis-gpu`.

## Contrato compartido

Ambos backends conservan ByteTrack, asignacion de equipos, porteros, posesion, velocidad, distancia, video anotado, `MetricSnapshot` y las claves R2 existentes. `metrics.json` mantiene `version: 1` y añade `inference.detector`, `format` y `device` cuando estan disponibles.

## Verificacion

```bash
python -m unittest analysis.tests.test_pipeline analysis.tests.test_yolo analysis.tests.test_locate_anything
npm test
npm run typecheck
npm run build
```

Antes de desplegar, procesar un clip canario y confirmar `processed.mp4`, `metrics.json`, progreso, cancelacion, streaming y eliminacion remota.
