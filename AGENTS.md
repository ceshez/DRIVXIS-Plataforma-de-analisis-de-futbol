# AGENTS.md - Reglas para Codex en DRIVXIS

Este archivo define como debe trabajar Codex dentro de este repositorio.

## Contexto rapido

DRIVXIS es una plataforma web para analisis de futbol por video. Permite registrar usuarios, subir videos de partidos, crear trabajos de analisis y guardar metricas generadas por un motor Python con YOLO.

Stack principal:

- Next.js App Router + React + TypeScript
- Tailwind CSS
- Route Handlers en `app/api/**/route.ts`
- PostgreSQL + Prisma
- Zod para validaciones
- Python + YOLO/Ultralytics/OpenCV para analisis de video
- Vitest para pruebas basicas

Antes de modificar codigo, leer:

1. `docs/CODEX.md`
2. `docs/PROJECT_CONTEXT.md`
3. `docs/ARCHITECTURE.md`
4. El documento especifico de la tarea, si aplica.

## Reglas de trabajo

- Hacer el cambio mas pequeno y seguro posible.
- No reescribir archivos completos si solo se necesita un ajuste puntual.
- No modificar archivos no relacionados con la tarea.
- Mantener comportamiento existente salvo que la tarea pida cambiarlo.
- Si una tarea toca varias areas, dividirla mentalmente en pasos: UI, API, base de datos, worker, pruebas.
- No cambiar `package.json`, Prisma, auth, storage ni worker de analisis si la tarea no lo pide explicitamente.
- No inventar endpoints, modelos o variables de entorno: revisar docs y codigo primero.
- Usar TypeScript estricto y mantener validaciones con Zod donde aplique.
- Para endpoints protegidos, respetar el sistema actual de sesion con cookie `drivxis_session`.
- Para videos, no guardar archivos pesados en PostgreSQL; guardar metadata y `objectKey`.
- Despues de implementar, resumir archivos modificados, cambios realizados, supuestos, pruebas sugeridas y riesgos.

## Comandos utiles

```bash
npm run typecheck
npm test
npm run build
npm run analysis:worker -- --once
```

## Formato recomendado al terminar

Responder siempre con:

- Archivos modificados
- Que cambio
- Como probarlo
- Riesgos o pendientes
