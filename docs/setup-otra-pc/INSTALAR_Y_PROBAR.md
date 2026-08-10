# Instalar y probar en otra computadora (Windows)

Windows puede ejecutar la aplicacion web y el worker YOLO local.

## 1) Clonar e instalar

```powershell
git clone <URL_DEL_REPO>
cd DRIVXIS-Plataforma-de-analisis-de-futbol
npm install
python -m venv .venv-analysis
.\.venv-analysis\Scripts\python.exe -m pip install -r analysis\requirements.txt
npx prisma migrate deploy
npx prisma generate
```

## 2) Configurar `.env`

Completa base de datos, storage y secretos. Para desarrollo local usa:

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

El modelo no se confirma en Git. Copia/exporta `analysis/models/best.onnx` antes de iniciar el worker.

## 3) Probar

```powershell
.\.venv-analysis\Scripts\python.exe analysis\check_runtime.py
npm run analysis:worker -- --once
npm run dev
```

Sube un video. Debe mostrar `Esperando worker`, cambiar a `processing` cuando el worker lo reclame y terminar en `completed`.

## 4) Produccion

Mantener `ANALYSIS_AUTO_START=false` en la web y desplegar `compose.analysis-worker.yml`. El contenedor descarga `models/best.onnx` desde R2 a su volumen persistente.

## Troubleshooting

- Si el preflight falla, revisar `ANALYSIS_MODEL_PATH` y `analysis/requirements.txt`.
- Si el job queda en cola, comprobar que el worker comparte `DATABASE_URL` con la web.
- Si falla la descarga, comprobar `ANALYSIS_MODEL_OBJECT_KEY` y las credenciales R2.
