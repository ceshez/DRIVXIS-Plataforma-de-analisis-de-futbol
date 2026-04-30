# Plan de implementación (mañana)

## Objetivo
Pasar de un pipeline local a un pipeline listo para producción:
- Subida más simple para el usuario.
- Persistencia en base de datos + storage externo.
- Worker de análisis desacoplado de la máquina local.

## Fase 1: Upload UX + persistencia estable
1. Simplificar el flujo de upload:
- Un solo botón de carga.
- Validaciones claras (tamaño, formato, duración).
- Estado visible: `uploading -> processing -> completed/failed`.

2. Guardar metadata robusta en DB:
- `video.sourceUrl` (storage remoto, no path local).
- `video.processedUrl`.
- `analysisJob.progress`, `startedAt`, `endedAt`, `error`.

3. Evitar dependencia del filesystem local:
- Mantener local solo para desarrollo.
- Producción: storage S3/R2/Cloudflare compatible.

## Fase 2: Worker y cola de análisis
1. Correr worker como proceso independiente (o contenedor).
2. Definir estrategia de cola:
- Inicial: tabla `AnalysisJob` (polling controlado).
- Siguiente: Redis/BullMQ o similar.

3. Reintentos y resiliencia:
- `FAILED` con error detallado.
- Endpoint de retry.
- Logs por job con correlación por `videoId/jobId`.

## Fase 3: Cloud readiness
1. Variables de entorno por ambiente (`dev/stage/prod`).
2. DB remota (Postgres administrado).
3. Storage remoto con URL firmada para upload/stream.
4. Worker desplegado donde haya acceso a modelo y ffmpeg.

## Fase 4: Calidad de análisis (cuando mandes tus archivos)
1. Incorporar tus nuevos archivos/modelos.
2. Recalibrar velocidad/distancia con mejor homografía.
3. Versionar resultados del modelo (`metrics.version`, `modelVersion`).
4. Comparar métricas entre versión actual y nueva.

## Checklist de aceptación
- Subo video sin fricción desde dashboard.
- Se persiste en DB y storage remoto.
- Worker procesa sin depender de esta PC.
- Dashboard muestra `processedVideoUrl` siempre.
- Reintentos funcionan.
- Logs y errores trazables por job.
