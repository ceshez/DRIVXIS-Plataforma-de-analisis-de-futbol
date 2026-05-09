# Roadmap - DRIVXIS

Este documento resume hacia donde puede crecer el sistema.

## Prioridad 1: Analisis real mas confiable

- Mejorar deteccion de jugadores.
- Mejorar tracking entre frames.
- Mejorar deteccion del balon.
- Mejorar asignacion de equipos.
- Corregir asignacion de porteros para que no se detecten multiples porteros por equipo.
- Reducir falsos positivos.

## Prioridad 2: Metricas utiles para futbol

- Posesion por equipo.
- Distancia cubierta por jugador.
- Velocidad maxima por jugador.
- Zonas de mayor participacion.
- Eventos importantes.
- Timeline del partido.

## Prioridad 3: Experiencia de usuario

- Pagina de detalle por video.
- Estados mas claros de procesamiento.
- Reporte visual del analisis.
- Comparacion entre equipos.
- Visualizacion por jugador.
- Mejoras mobile.

## Prioridad 4: Reportes

- Exportar PDF.
- Exportar CSV.
- Compartir reporte por link.
- Historial de analisis por video.

## Prioridad 5: Escalabilidad

- Worker separado del servidor web.
- Cola de jobs mas robusta.
- Notificaciones al terminar analisis.
- Multi-tenant para clubes/equipos.
- Roles por organizacion.

## Prioridad 6: Admin

- Panel admin.
- Gestion de usuarios.
- Videos globales.
- Estadisticas de uso.

## Mejoras tecnicas pendientes

- Convertir `MetricSnapshot.jobId` en FK real hacia `AnalysisJob` si el modelo lo requiere.
- Manejar auth en endpoints con JSON 401/403 cuando se consuma desde `fetch`.
- Agregar paginacion en `GET /api/videos`.
- Agregar logs estructurados.
- Agregar trazas del pipeline de analisis.

## Regla para Codex

Antes de implementar algo del roadmap:

1. Analizar impacto.
2. Identificar archivos involucrados.
3. Proponer plan.
4. Implementar solo lo aprobado o solicitado.
