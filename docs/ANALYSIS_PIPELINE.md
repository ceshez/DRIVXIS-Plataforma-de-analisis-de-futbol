# Pipeline de Analisis - DRIVXIS

Este documento explica como debe entenderse el flujo de analisis de video dentro del proyecto.

## Objetivo

Procesar videos de partidos de futbol para generar metricas tacticas y fisicas usando un motor Python basado en YOLO.

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

Comando principal:

```bash
npm run analysis:worker -- --once
```

Reglas:

- El worker debe poder ejecutarse localmente.
- Si falla el analisis, debe marcar el job como `FAILED` y guardar error.
- Si termina correctamente, debe marcar el job como `COMPLETED` y guardar metricas.
- No debe bloquear el dashboard.

## Python / YOLO

Dependencias esperadas:

```bash
pip install -r analysis/requirements.txt
```

Peso esperado del modelo:

```txt
analysis/models/best.pt
```

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
