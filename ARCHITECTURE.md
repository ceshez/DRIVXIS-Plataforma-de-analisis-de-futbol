# Arquitectura del Sistema (DRIVXIS)

Este documento explica como esta organizado el sistema, que partes lo componen y como se comunican.

## Tipo de arquitectura utilizada

- **Arquitectura web cliente-servidor**, donde:
  - El **cliente (navegador)** consume una aplicacion web en Next.js.
  - El **servidor (Next.js)** renderiza paginas (Server Components) y expone **endpoints HTTP** (Route Handlers).
  - La persistencia se maneja en una **base de datos PostgreSQL** a traves de Prisma.
- A nivel de organizacion interna, se parece a un **MVC simplificado**:
  - Vistas: paginas y componentes (`app/`, `components/`)
  - Controladores: endpoints en `app/api/**/route.ts`
  - Modelo: Prisma (`prisma/schema.prisma`) + acceso a datos via `lib/prisma.ts`

## Componentes principales

### Frontend (UI)

- Ubicacion: `app/` y `components/`
- Responsabilidades:
  - Landing page
  - Formularios de login/registro
  - Dashboard y paginas internas protegidas
  - Flujo de subida/registro de video desde el navegador

### Backend (API + Server Rendering)

- Ubicacion: `app/api/**/route.ts`
- Responsabilidades:
  - Autenticacion (register/login/logout)
  - Gestion de videos (listar videos, registrar metadata)
  - Presign de carga a storage (opcional)
  - Traduccion (si se configura API key, usa cache)

### Base de datos

- PostgreSQL
- Esquema Prisma: `prisma/schema.prisma`
- Tablas principales: `User`, `Video`, `AnalysisJob`, `MetricSnapshot`, `TranslationCache`

### Storage de videos (opcional)

- Compatible con S3
- Se usa solo para el archivo real del video
- La BD mantiene la metadata y la `objectKey` del archivo

## Como se comunican entre si

1. El navegador llama endpoints internos con `fetch("/api/...")`.
2. Los endpoints validan entrada con Zod y usan Prisma para leer/escribir en PostgreSQL.
3. Para videos:
   - El navegador pide un presign al servidor (`/api/videos/presign`).
   - Si el storage esta configurado, el navegador sube directo al bucket con `PUT` (URL firmada).
   - Luego el navegador registra la metadata en el servidor (`/api/videos`), y el servidor guarda en la BD.

## Diagrama representativo (Mermaid)

```mermaid
flowchart LR
  U["Usuario (navegador)"] -->|Navega| W["Next.js App (UI)"]
  U -->|fetch /api/...| API["Route Handlers (app/api)"]

  API -->|Prisma| DB["PostgreSQL"]

  API -->|Presign (opcional)| S3["Storage S3-compatible"]
  U -->|PUT video (opcional)| S3

  W -->|Server-side rendering| API
```

## Archivos clave (para explicar en una exposicion)

- Sesion y proteccion:
  - `lib/session.ts` (cookie `drivxis_session`, firma HMAC, `requireUser()` redirige si no hay sesion)
- Persistencia:
  - `lib/prisma.ts` (cliente Prisma)
  - `prisma/schema.prisma` (modelo de datos)
- Endpoints:
  - `app/api/auth/register/route.ts`
  - `app/api/auth/login/route.ts`
  - `app/api/auth/logout/route.ts`
  - `app/api/videos/presign/route.ts`
  - `app/api/videos/route.ts`
  - `app/api/translate/route.ts`

