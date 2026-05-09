# DRIVXIS | Plataforma de Analisis de Futbol

DRIVXIS es una plataforma web para registrar videos de partidos de futbol y generar analitica tactica/fisica a partir del video.

La version actual incluye:

- Autenticacion de usuarios.
- Dashboard protegido.
- Biblioteca de videos.
- Subida local o a storage compatible con S3.
- Cola de analisis conectada a un motor Python basado en YOLO.
- Persistencia con PostgreSQL y Prisma.

## Stack principal

- Next.js App Router + React + TypeScript
- Tailwind CSS
- Route Handlers en `app/api/**/route.ts`
- PostgreSQL + Prisma
- Zod
- bcryptjs + cookie de sesion firmada
- Storage S3/R2/MinIO o fallback local
- Python + YOLO/Ultralytics + OpenCV
- Vitest

## Ejecutar en local

Guia completa:

- [`docs/RUNNING.md`](./docs/RUNNING.md)

Resumen rapido:

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Abrir:

```txt
http://localhost:3000
```

Para ejecutar el worker:

```bash
npm run analysis:worker -- --once
```

## Documentacion

Indice principal:

- [`docs/INDEX.md`](./docs/INDEX.md)

Documentos clave:

- [`AGENTS.md`](./AGENTS.md) - reglas para Codex dentro del repo.
- [`docs/CODEX.md`](./docs/CODEX.md) - guia para pedir tareas a Codex.
- [`docs/PROJECT_CONTEXT.md`](./docs/PROJECT_CONTEXT.md) - contexto general del proyecto.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - arquitectura.
- [`docs/DATABASE.md`](./docs/DATABASE.md) - base de datos.
- [`docs/API.md`](./docs/API.md) - endpoints y contratos.
- [`docs/ANALYSIS_PIPELINE.md`](./docs/ANALYSIS_PIPELINE.md) - worker y analisis de video.
- [`docs/UI_GUIDE.md`](./docs/UI_GUIDE.md) - reglas visuales.
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) - mejoras futuras.

## Prompt recomendado para Codex

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

## Comandos de verificacion

```bash
npm run typecheck
npm test
npm run build
```
