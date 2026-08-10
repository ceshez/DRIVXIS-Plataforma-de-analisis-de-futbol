# Indice de Documentacion - DRIVXIS

Usa este indice para saber que documento leer antes de pedirle una tarea a Codex.

## Lectura obligatoria para Codex

1. `AGENTS.md` - reglas permanentes de trabajo dentro del repo.
2. `docs/CODEX.md` - guia para pedir tareas, modelos e inteligencia recomendada.
3. `docs/PROJECT_CONTEXT.md` - contexto general del producto y del stack.

## Documentos tecnicos

- `docs/ARCHITECTURE.md` - arquitectura general del sistema.
- `docs/DATABASE.md` - modelos, relaciones y decisiones de base de datos.
- `docs/API.md` - endpoints, contratos y flujo de subida/analisis.
- `docs/ANALYSIS_PIPELINE.md` - worker YOLO/LocateAnything, jobs y metricas.
- `docs/CLOUDFLARE_R2.md` - configuracion de Cloudflare R2 para videos.
- `docs/RUNNING.md` - como ejecutar el proyecto localmente.

## Producto y roadmap

- `docs/ROADMAP.md` - mejoras futuras y prioridades.
- `docs/UI_GUIDE.md` - reglas visuales y de UI para mantener consistencia.
- `docs/CHATBOT_DEMO.md` - comportamiento y estados del chatbot demo del dashboard.

## Que leer segun la tarea

### UI, dashboard o componentes

Leer:

- `AGENTS.md`
- `docs/CODEX.md`
- `docs/PROJECT_CONTEXT.md`
- `docs/UI_GUIDE.md`

### Endpoints/API

Leer:

- `AGENTS.md`
- `docs/CODEX.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`

### Base de datos o Prisma

Leer:

- `AGENTS.md`
- `docs/CODEX.md`
- `docs/DATABASE.md`

### Worker, YOLO, LocateAnything o analisis de video

Leer:

- `AGENTS.md`
- `docs/CODEX.md`
- `docs/ANALYSIS_PIPELINE.md`
- `docs/DATABASE.md`

### Storage, Cloudflare R2 o videos remotos

Leer:

- `AGENTS.md`
- `docs/CODEX.md`
- `docs/CLOUDFLARE_R2.md`
- `docs/API.md`
- `docs/ANALYSIS_PIPELINE.md`

### Setup, errores de build o entorno local

Leer:

- `AGENTS.md`
- `docs/RUNNING.md`
- `package.json`

## Prompt corto recomendado

```txt
Read first:
- AGENTS.md
- docs/INDEX.md
- docs/CODEX.md
- docs/PROJECT_CONTEXT.md

Task:
[describe la tarea]

Modify only:
[archivos o carpetas]

Do not modify:
[partes delicadas]

Make the smallest safe change.
Preserve existing functionality.
After finishing, summarize files changed, what changed, how to test and risks.
```
