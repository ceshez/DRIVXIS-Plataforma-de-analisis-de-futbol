# DRIVXIS - Pendientes Para Que El Modelo Analice Videos Reales

Este documento explica que falta para que el motor de IA funcione con videos reales y que informacion debe pedir el proximo agente antes de continuar.

## Estado Actual

- La app ya tiene el flujo web preparado para subir videos desde `/dashboard`.
- Si no hay S3 configurado, los videos se guardan localmente en `.drivxis/uploads`.
- La pagina `/dashboard/videos` ya funciona como historial y muestra estadisticas por partido cuando existen.
- El worker `npm run analysis:worker` ya existe y toma trabajos `AnalysisJob` en cola.
- El CLI Python `analysis/run_analysis.py` ya existe y genera:
  - Un video anotado.
  - Un archivo `metrics.json` con posesion, velocidad, distancia y datos del video.
- Aun no se pueden analizar videos reales hasta instalar dependencias Python y agregar el peso del modelo YOLO.

## Decision Operativa Actual

- La primera puesta en marcha se hara en **modo local**.
- **No hacen falta credenciales de Cloudflare R2** para arrancar el analisis inicial.
- El archivo `analysis/models/best.pt` ya esta presente localmente.
- El siguiente paso tecnico es usar un entorno virtual dedicado del worker, idealmente con **Python 3.11**.

Nota de entorno actual:

- En esta maquina se detecto Python `3.12` y `3.13`, ademas del Python global `3.14.4`.
- Para esta etapa se debe **evitar Python 3.14** con el stack de vision.
- Si 3.11 aun no esta instalado, se puede arrancar localmente con **Python 3.12** sin depender de Cloudflare.

## Archivos Que Faltan

### 1. Entorno Python dedicado

Comando recomendado:

```bash
py -3.11 -m venv .venv-analysis
```

Si Python 3.11 no esta disponible todavia:

```bash
py -3.12 -m venv .venv-analysis
```

Luego instala:

```bash
.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
.venv-analysis\Scripts\python.exe -m pip install -r analysis/requirements.txt
```

Y apunta el worker a ese binario:

```env
PYTHON_BIN=".venv-analysis/Scripts/python.exe"
```

### 2. Modelo YOLO entrenado

Archivo requerido:

```text
analysis/models/best.pt
```

Este archivo no debe subirse a Git porque puede ser pesado. Ya esta ignorado por `.gitignore`.

Fuente esperada:

- El README del proyecto `abdullahtarek/football_analysis` enlaza un modelo entrenado de YOLO.
- Tambien puedes pasar otro `.pt` compatible con Ultralytics si fue entrenado para detectar jugadores, arbitros y balon.

### 3. Video de prueba real

Pasa al menos un video corto para probar el pipeline completo.

Recomendado:

```text
MP4, 10-60 segundos, camara lateral o elevada, campo visible
```

Evita empezar con partidos completos de 90 minutos hasta validar que el pipeline corre bien.

### 4. Configuracion del entorno

Variables relevantes en `.env`:

```env
LOCAL_STORAGE_ROOT=".drivxis/uploads"
ANALYSIS_STORAGE_ROOT=".drivxis/analysis"
ANALYSIS_MODEL_PATH="analysis/models/best.pt"
PYTHON_BIN=".venv-analysis/Scripts/python.exe"
ANALYSIS_WORKER_INTERVAL_MS="5000"
```

Las variables de S3/R2/MinIO solo hacen falta si despues quieres storage remoto:

```env
STORAGE_ENDPOINT=""
STORAGE_REGION=""
STORAGE_BUCKET=""
STORAGE_ACCESS_KEY_ID=""
STORAGE_SECRET_ACCESS_KEY=""
```

No pegues llaves secretas en el chat. Colocalas directamente en `.env`.

## Como Probar Cuando Esten Los Archivos

1. Crear el entorno virtual:

```bash
py -3.11 -m venv .venv-analysis
```

2. Instalar dependencias:

```bash
.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
.venv-analysis\Scripts\python.exe -m pip install -r analysis/requirements.txt
```

3. Confirmar que existe:

```text
analysis/models/best.pt
```

4. Levantar la app:

```bash
npm run dev
```

5. Subir un video desde `/dashboard`.

6. Ejecutar el worker:

```bash
npm run analysis:worker -- --once
```

7. Revisar `/dashboard/videos`.

Resultado esperado:

- El video pasa de `PENDING_ANALYSIS` a `PROCESSING`.
- Si el modelo corre bien, termina en `COMPLETED`.
- Se genera video anotado en `.drivxis/analysis/<videoId>/annotated.mp4`.
- Se genera metricas en `.drivxis/analysis/<videoId>/metrics.json`.
- El historial muestra posesion, velocidad maxima, velocidad promedio, distancia y jugadores detectados.

## Posibles Fallos Esperados

### Falta `best.pt`

Mensaje esperado:

```text
Missing YOLO model at analysis/models/best.pt
```

Solucion:

- Pasar o descargar el archivo `best.pt`.
- Colocarlo exactamente en `analysis/models/best.pt`.

### Faltan dependencias Python

Mensaje esperado:

```text
Missing Python dependency ...
```

Solucion:

```bash
.venv-analysis\Scripts\python.exe -m pip install -r analysis/requirements.txt
```

### El modelo no detecta bien

Posibles causas:

- El `.pt` no fue entrenado para las clases esperadas.
- El video tiene mala perspectiva, resolucion baja o poco campo visible.
- Las clases del modelo no se llaman `player`, `goalkeeper`, `referee` y `ball`.

Compatibilidad flexible ya contemplada:

- `player` o `person`
- `ball` o `football`
- `goalkeeper`, `goalie`, `keeper` o `gk`
- `referee`, `ref` o `official`

El proximo ajuste probable seria mapear nombres de clases alternativos dentro de `analysis/run_analysis.py`.

## Preguntas Que Debe Hacer El Proximo Agente

Antes de tocar codigo, el proximo agente debe preguntar:

1. Donde esta el archivo del modelo YOLO `best.pt`?
2. Donde esta el video corto de prueba que quieres analizar?
3. Quieres usar storage local o S3/R2/MinIO para esta prueba?
4. Ya instalaste las dependencias Python o quieres que se haga en un entorno virtual?
5. El modelo que vas a pasar detecta estas clases: `player/person`, `goalkeeper`, `referee` y `ball/football`?

## Archivos Importantes Del Proyecto

Motor IA:

```text
analysis/run_analysis.py
analysis/requirements.txt
analysis/models/best.pt
```

Worker:

```text
scripts/analysis-worker.mjs
```

Contratos de metricas:

```text
lib/analysis-metrics.ts
lib/video-serialization.ts
```

Storage:

```text
lib/storage.ts
lib/local-storage.ts
app/api/videos/local-upload/route.ts
app/api/videos/[id]/stream/route.ts
```

UI:

```text
components/video-upload-dropzone.tsx
components/video-history.tsx
components/dashboard-experience.tsx
```

## Primer Paso Recomendado En La Proxima Conversacion

Pasa estos dos archivos o rutas locales:

```text
1. Ruta del modelo: analysis/models/best.pt
2. Ruta de un video corto de prueba: <tu-video>.mp4
```

Con eso se puede ejecutar una prueba real del pipeline y ajustar el codigo si el modelo usa nombres de clases distintos o si el video requiere otra configuracion.
