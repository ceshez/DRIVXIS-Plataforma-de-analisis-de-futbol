# Propuesta de Mejoras Futuras (Roadmap)

Esta seccion te ayuda a explicar que falta y hacia donde puede crecer el sistema.

## Funcionalidades pendientes

- Conectar el pipeline real de vision computacional:
  - Ingesta del video desde storage
  - Deteccion de jugadores/ball (modelo)
  - Generacion de eventos y metricas reales
  - Escritura de `MetricSnapshot` por tiempo o por periodos (primer tiempo/segundo tiempo)
- Pagina de detalle por video:
  - Timeline de eventos
  - Mapas de calor por jugador
  - Descarga de reportes (PDF/CSV)
- Administracion (rol `ADMIN`):
  - Ver usuarios
  - Ver videos globales y estadisticas de uso

## Posibles optimizaciones tecnicas

- Cambiar `MetricSnapshot.jobId` a FK real hacia `AnalysisJob` (consistencia referencial).
- Manejar auth en endpoints con respuesta JSON (401/403) cuando el consumidor sea `fetch` (en vez de redirect), para que sea mas "API-friendly".
- Paginacion en `GET /api/videos` (hoy retorna max 50).
- Observabilidad:
  - logs estructurados en endpoints
  - trazas del pipeline de analisis

## Ideas de evolucion del sistema

- Colas de trabajo para analisis asincrono (por ejemplo: workers separados del web server).
- Notificaciones al terminar el analisis (email o UI).
- Multi-tenant (clubes/equipos) con permisos y roles por organizacion.
- Soporte para distintos deportes o distintos "perfiles" de analisis.

