# Pipeline de Analisis - DRIVXIS

Este documento explica como debe entenderse el flujo de analisis de video dentro del proyecto.

## Objetivo

Procesar videos de partidos de futbol para generar metricas tacticas y fisicas usando YOLO como detector predeterminado y el pipeline temporal existente de DRIVXIS. NVIDIA LocateAnything-3B se conserva como opcion de investigacion/evaluacion no comercial.

## Flujo general

1. El usuario sube o registra un video.
2. El sistema guarda metadata del video en PostgreSQL.
3. Se crea un `AnalysisJob` en estado `QUEUED`.
4. El worker toma jobs pendientes.
5. El worker ejecuta el analisis sobre el video.
6. El sistema actualiza progreso y estado del job.
7. Al terminar, guarda resultados en `MetricSnapshot`.
8. La UI muestra los datos en el dashboard o detalle del video.

## Modelos relacionados

### Video

Representa el archivo registrado por el usuario.

Campos importantes:

- `ownerId`
- `objectKey`
- `originalFilename`
- `mimeType`
- `sizeBytes`
- `durationSeconds`
- `status`
- `metadata`

### AnalysisJob

Representa una ejecucion de analisis.

Estados:

- `QUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`

Una cancelacion solicitada por el usuario se mantiene compatible con este enum: el job termina como `FAILED` con el marcador `ANALYSIS_CANCELLED_BY_USER`, mientras el video vuelve a `UPLOADED`. La API serializa `latestJob.cancelled: true` para que la interfaz lo presente como cancelado y no como un fallo tecnico.

Campos importantes:

- `videoId`
- `status`
- `progress`
- `error`
- `startedAt`
- `endedAt`

### MetricSnapshot

Guarda resultados del analisis.

Campos importantes:

- `videoId`
- `jobId`
- `metrics`
- `createdAt`

## Storage

Los videos pesados no deben guardarse en PostgreSQL.

La base de datos guarda:

- metadata
- `objectKey`
- estados
- resultados

El archivo real vive en:

- S3/R2/MinIO si hay storage configurado.
- `.drivxis/uploads` en desarrollo local.

## Worker

Comando principal del consumidor de cola:

```bash
npm run analysis:worker -- --once
```

Reglas:

- El worker solo reclama jobs despues de validar el backend seleccionado y su modelo.
- YOLO admite Windows/Linux y CPU/GPU. LocateAnything exige Linux, CUDA, BF16 y al menos 24 GB de VRAM.
- Si falla el analisis, debe marcar el job como `FAILED` y guardar error.
- Si termina correctamente, debe marcar el job como `COMPLETED` y guardar metricas.
- Debe consultar cancelaciones durante la inferencia, terminar el proceso Python y evitar uploads, snapshots o estados `COMPLETED` posteriores.
- No debe bloquear el dashboard.

## Python / detectores

Dependencias esperadas:

```bash
pip install -r analysis/requirements.txt
```

Configuracion predeterminada YOLO/ONNX:

```env
ANALYSIS_DETECTOR="yolo"
ANALYSIS_MODEL_PATH="analysis/models/best.onnx"
ANALYSIS_MODEL_OBJECT_KEY="models/best.onnx"
ANALYSIS_DETECTION_FPS="5"
ANALYSIS_BATCH_SIZE="4"
ANALYSIS_MAX_WIDTH="1280"
YOLO_IMAGE_SIZE="640"
YOLO_PROCESS_EVERY_FRAME="true"
YOLO_FALLBACK_IMAGE_SIZE="1280"
YOLO_SPARSE_PLAYER_THRESHOLD="8"
YOLO_SPARSE_PLAYER_MAX_HEIGHT_RATIO="0.22"
```

El worker usa el archivo local si existe. Si falta, lo descarga una vez desde `ANALYSIS_MODEL_OBJECT_KEY` en R2 o desde `ANALYSIS_MODEL_URL` y lo conserva en el volumen `/models`. YOLO procesa cada frame para mantener detecciones continuas durante zooms y movimientos de camara; LocateAnything conserva el muestreo configurado de 5 FPS. ByteTrack mantiene los IDs e interpola huecos cortos. Cuando un frame contiene menos de ocho jugadores y los detectados son pequenos, YOLO lo reintenta a 1280 px sobre el frame nativo para recuperar jugadores lejanos; las cajas se convierten de nuevo a las coordenadas de analisis.

LocateAnything se activa explicitamente:

```env
ANALYSIS_DETECTOR="locateanything"
LOCATEANYTHING_MODEL_ID="nvidia/LocateAnything-3B"
LOCATEANYTHING_REVISION="c32291ca5e996f5a7a485845b4f57a233936bba0"
LOCATEANYTHING_DETECTION_FPS="5"
LOCATEANYTHING_BATCH_SIZE="4"
ANALYSIS_MAX_WIDTH="1920"
```

Produccion usa `Dockerfile.analysis-worker`/`compose.analysis-worker.yml` para YOLO CPU y `Dockerfile.analysis-gpu`/`compose.analysis-gpu.yml` para LocateAnything. Ningun contenedor expone puertos; ambos consumen PostgreSQL y R2 mediante conexiones salientes. La aplicacion web debe mantener `ANALYSIS_AUTO_START=false`.

Para proyectos personales desplegados en Vercel Hobby, YOLO tambien puede ejecutarse bajo demanda con Vercel Sandbox. El navegador mantiene la carga directa a R2; la API crea el job y arranca un Sandbox desacoplado que reclama un unico trabajo con `--once`. El snapshot contiene Python, FFmpeg, las dependencias y `best.onnx`, por lo que el modelo no se publica en GitHub. Antes de cada ejecucion, el Sandbox actualiza el codigo desde `main`.

```bash
vercel link --yes --project drivxis
vercel env pull .env.local --yes
npm run analysis:sandbox:snapshot
```

El ID impreso por el ultimo comando se configura en Vercel junto con:

```env
ANALYSIS_AUTO_START="true"
ANALYSIS_WORKER_MODE="vercel-sandbox"
ANALYSIS_SANDBOX_SNAPSHOT_ID="snap_..."
ANALYSIS_SANDBOX_TIMEOUT_MS="2700000"
ANALYSIS_SANDBOX_VCPUS="4"
```

La sesion individual tiene el limite del plan Hobby (45 minutos). Si un video no termina dentro de ese tiempo, el pipeline debe dividirse en segmentos antes de considerarlo apto para esta modalidad.

## Reglas para Codex

Cuando modifique el pipeline:

- Leer primero `docs/DATABASE.md`.
- No cambiar UI si la tarea solo es del worker.
- No cambiar Prisma schema si no es necesario.
- No instalar dependencias nuevas sin justificarlo.
- Mantener soporte para desarrollo local.
- Manejar errores de forma clara.
- No asumir que S3 esta configurado.

## Ideas futuras

- Mejor tracking de jugadores.
- Mejor asignacion de equipos.
- Mejor deteccion de porteros.
- Mejor deteccion y tracking de balon.
- Velocidad maxima por jugador.
- Distancia cubierta por jugador.
- Posesion por equipo.
- Eventos en timeline.
- Mapas de calor.
- Reportes PDF/CSV.
