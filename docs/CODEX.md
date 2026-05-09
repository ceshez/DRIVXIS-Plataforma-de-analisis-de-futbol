# Guia para pedirle tareas a Codex

Este documento existe para que puedas pedir cambios a Codex sin repetir todo el contexto del proyecto cada vez.

## Regla principal

Una tarea por prompt. Mientras mas claro sea el limite, menos probable es que Codex rompa partes del proyecto.

```txt
Read first:
- AGENTS.md
- docs/CODEX.md
- docs/PROJECT_CONTEXT.md

Task:
...

Modify only:
...

Do not modify:
...

After finishing, summarize:
- Files changed
- What changed
- How to test
- Risks
```

## Que modelo usar

Basado en la guia de uso de modelos que se definio para el proyecto:

- Arquitectura, decisiones dificiles, base de datos, seguridad o debugging complejo: usar modelo fuerte de razonamiento.
- Implementacion real dentro del repositorio: usar Codex.
- Diseno visual, UX, copy o polish: usar modelo de diseno/visual y luego Codex para implementar.
- Prompts, resumenes y docs simples: usar modelo mini o barato.

## Niveles de inteligencia recomendados

- Baja: textos pequenos, nombres, labels, prompts simples.
- Media: bugs claros, componentes pequenos, docs simples.
- Media-alta: trabajo normal de codigo, componentes importantes, fixes con logica.
- Alta: features grandes, dashboard, endpoints, base de datos, refactors importantes.
- Maxima: casi nunca; solo auth, permisos, migraciones delicadas, seguridad o bugs muy raros.

## Flujo recomendado para cambios grandes

### Paso 1: Analisis sin tocar archivos

```txt
Read first:
- AGENTS.md
- docs/CODEX.md
- docs/PROJECT_CONTEXT.md
- docs/ARCHITECTURE.md

Do not modify files.
Analyze how to implement [feature].
Return a plan with:
- files likely involved
- data model impact
- API impact
- UI impact
- risks
- testing plan
```

### Paso 2: Implementacion limitada

```txt
Implement only the approved plan.
Make the smallest safe change.
Do not rewrite unrelated files.
Preserve existing functionality.
After finishing, summarize files changed, testing steps and risks.
```

## Prompts base

### Arreglar un bug claro

```txt
Read first:
- AGENTS.md
- docs/CODEX.md

Bug:
[describe el error]

Expected behavior:
[que deberia pasar]

Modify only the files needed to fix this bug.
Do not refactor unrelated code.
Run or suggest:
- npm run typecheck
- npm test
```

### Crear o mejorar una pantalla

```txt
Read first:
- AGENTS.md
- docs/CODEX.md
- docs/UI_GUIDE.md

Task:
[describe la pantalla o componente]

Modify only:
- [archivo o carpeta]

Do not modify:
- prisma/
- auth/session logic
- analysis worker
- package.json

Requirements:
- keep responsive layout
- preserve existing data flow
- use Tailwind CSS
- keep TypeScript clean
```

### Cambiar base de datos

```txt
Read first:
- AGENTS.md
- docs/CODEX.md
- docs/DATABASE.md

Do not modify files yet.
Analyze the safest Prisma schema change for:
[describe necesidad]

Return:
- model changes
- migration risks
- affected endpoints
- affected UI
- testing plan
```

### Crear endpoint

```txt
Read first:
- AGENTS.md
- docs/API.md
- docs/ARCHITECTURE.md

Task:
Create/update endpoint [endpoint].

Requirements:
- use Zod validation
- respect current session system
- return JSON errors where appropriate
- keep Prisma access simple
- do not change unrelated routes
```

### Trabajar con el worker de analisis

```txt
Read first:
- AGENTS.md
- docs/ANALYSIS_PIPELINE.md
- docs/DATABASE.md

Task:
[describe cambio en analisis]

Rules:
- do not change UI unless requested
- do not change Prisma schema unless necessary
- preserve local development fallback
- document any required Python dependency
```

## Frases que conviene usar siempre

```txt
Make the smallest safe change.
Preserve existing functionality.
Do not rewrite unrelated files.
Do not modify package.json unless required.
Do not change database schema unless required.
Do not touch auth/session logic unless required.
Summarize changes and testing steps.
```

## Frases que debes evitar

```txt
Improve the whole project.
Make it better.
Fix everything.
Refactor all code.
Change whatever is necessary.
```

Esas frases hacen que Codex toque demasiados archivos y aumentan el riesgo de romper el proyecto.
