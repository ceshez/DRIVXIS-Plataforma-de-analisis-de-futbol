# Contexto del Proyecto - DRIVXIS

## Que es DRIVXIS

DRIVXIS es una plataforma web para registrar videos de partidos de futbol y generar analitica tactica/fisica a partir del video.

La version actual incluye:

- Autenticacion de usuarios.
- Dashboard protegido.
- Biblioteca de videos.
- Subida local o a storage compatible con S3.
- Cola de analisis con YOLO/ONNX predeterminado y LocateAnything-3B como backend opcional de investigacion.
- Persistencia en PostgreSQL usando Prisma.

## Objetivo principal

Centralizar el flujo completo de analisis de video deportivo:

1. El usuario se registra o inicia sesion.
2. Sube o registra un video de partido.
3. El sistema crea un trabajo de analisis.
4. Un worker procesa el video.
5. Se guardan metricas y resultados.
6. El usuario visualiza estadisticas desde el dashboard.

## Stack tecnico

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Route Handlers de Next.js
- PostgreSQL
- Prisma ORM
- Zod
- bcryptjs
- Cookie de sesion firmada con HMAC
- Storage compatible con S3/R2/MinIO o fallback local
- Python
- YOLO/Ultralytics/ONNX Runtime (CPU o GPU)
- NVIDIA LocateAnything-3B/Transformers/CUDA (opcional, no comercial)
- OpenCV
- Supervision
- scikit-learn
- Vitest

## Areas principales del sistema

### Frontend

Ubicacion probable:

- `app/`
- `components/`

Responsabilidades:

- Landing page.
- Login y registro.
- Dashboard protegido.
- Flujo de subida/registro de videos.
- Visualizacion de estados, metricas y resultados.

### Backend/API

Ubicacion:

- `app/api/**/route.ts`

Responsabilidades:

- Auth.
- Registro y listado de videos.
- Presign de subida.
- Upload local.
- Detalle de videos.
- Reintento de analisis.
- Traduccion/cache si aplica.

### Base de datos

Ubicacion:

- `prisma/schema.prisma`

Modelos principales:

- `User`
- `Video`
- `AnalysisJob`
- `MetricSnapshot`
- `TranslationCache`

### Worker de analisis

Ubicacion probable:

- `scripts/analysis-worker.mjs`
- `analysis/`

Responsabilidades:

- Tomar jobs pendientes.
- Ejecutar pipeline Python.
- Guardar progreso/error/resultados.
- Generar snapshots de metricas.

## Reglas de producto

- Los videos pesados no se guardan en PostgreSQL.
- PostgreSQL guarda metadata, estados, object keys y resultados.
- El sistema debe funcionar en desarrollo aunque S3 no este configurado.
- El analisis debe poder fallar sin romper la app completa.
- La UI debe mostrar estados claros: subido, pendiente, procesando, completado o fallido.

## Prioridades futuras

1. Mejorar deteccion real de jugadores/equipos/porteros/balon.
2. Mostrar metricas fisicas y tacticas mas utiles.
3. Mejorar pagina de detalle por video.
4. Agregar timeline de eventos.
5. Agregar mapas de calor.
6. Agregar reportes PDF/CSV.
7. Separar worker del servidor web si el proyecto escala.

## Como debe pensar Codex

Cuando reciba una tarea, debe identificar primero a que area pertenece:

- UI/dashboard
- Auth
- Videos/storage
- API
- Base de datos
- Worker de analisis
- Documentacion
- Testing/build

Luego debe tocar solo los archivos necesarios para esa area.
