# Despliegue de DRIVXIS en Vercel

## Arquitectura de produccion

DRIVXIS usa dos runtimes porque el analisis de partidos no es una carga adecuada
para una funcion web efimera:

1. **Vercel (`drivxis.vercel.app`)**: Next.js, Route Handlers, autenticacion y UI.
2. **PostgreSQL administrado**: usuarios, videos, cola y metricas.
3. **Cloudflare R2**: videos originales/procesados, metricas exportadas y el modelo ONNX.
4. **Worker Docker**: Python, FFmpeg, OpenCV y YOLO; consume la cola desde PostgreSQL.

El worker y Vercel comparten `DATABASE_URL` y las credenciales de R2. La aplicacion
web siempre debe usar `ANALYSIS_AUTO_START=false` en produccion.

## 1. Base de datos

Se puede conservar la base remota que ya usa el proyecto. Configura dos URLs:

- `DATABASE_URL`: URL con pool o Prisma Accelerate, usada por Vercel y el worker.
- `DIRECT_DATABASE_URL`: URL PostgreSQL directa, usada solo por Prisma CLI para
  aplicar migraciones.

Antes del primer despliegue y cada vez que `prisma/migrations` cambie:

```bash
DIRECT_DATABASE_URL="postgresql://..." npm run prisma:deploy
```

No ejecutes `prisma migrate dev` contra produccion. No es necesario guardar
`DIRECT_DATABASE_URL` en Vercel si las migraciones se ejecutan desde una maquina
o un CI seguro.

## 2. Subir el modelo entrenado

El modelo no se confirma en Git ni se incluye en Vercel. Coloca el ONNX local en:

```txt
analysis/models/best.onnx
```

Con las credenciales de R2 en `.env`, ejecuta:

```bash
npm run analysis:model:upload
```

El comando sube el archivo a `models/best.onnx`, guarda su SHA-256 como metadata,
verifica el tamano y no reemplaza un objeto distinto por accidente. Para reemplazar
deliberadamente una version existente:

```bash
npm run analysis:model:upload -- --force
```

Para usar otra ruta o clave:

```env
ANALYSIS_MODEL_PATH="analysis/models/mi-modelo.onnx"
ANALYSIS_MODEL_OBJECT_KEY="models/mi-modelo.onnx"
```

Usa la misma `ANALYSIS_MODEL_OBJECT_KEY` en el entorno del worker. Al arrancar, el
worker descarga el modelo al volumen persistente `/models`; los despliegues siguientes
reutilizan ese volumen.

## 3. Worker de analisis

Vercel no ejecuta este contenedor. Usa un host Linux con Docker que pueda permanecer
encendido y alcanzar PostgreSQL y R2:

```bash
cp deploy/analysis-worker.env.example deploy/analysis-worker.env
# Completa DATABASE_URL, R2 y ANALYSIS_MODEL_OBJECT_KEY.
docker compose --env-file deploy/analysis-worker.env \
  -f compose.analysis-worker.yml up -d --build
docker compose --env-file deploy/analysis-worker.env \
  -f compose.analysis-worker.yml logs -f worker
```

Para YOLO, `DATABASE_URL` puede ser la URL con pool/Accelerate. El archivo
`deploy/analysis-worker.env` contiene secretos y esta ignorado por Git.

## 4. Crear el proyecto Vercel

En Vercel, importa el repositorio GitHub:

```txt
ceshez/DRIVXIS-Plataforma-de-analisis-de-futbol
```

Configura:

- Project Name: `drivxis`
- Framework Preset: `Next.js`
- Root Directory: `.`
- Production Branch: `main`

El nombre del proyecto asigna el dominio de produccion `drivxis.vercel.app` si
esta disponible. La integracion Git crea previews para otras ramas y un despliegue
de produccion por cada push a `main`.

## 5. Variables de Vercel

Usa `deploy/vercel.env.example` como lista. En **Production** configura como minimo:

```txt
DATABASE_URL
NEXTAUTH_SECRET
STORAGE_ENDPOINT
STORAGE_REGION
STORAGE_BUCKET
STORAGE_ACCESS_KEY_ID
STORAGE_SECRET_ACCESS_KEY
ANALYSIS_AUTO_START=false
```

Tambien configura `RESEND_API_KEY`, `EMAIL_FROM` y `GOOGLE_TRANSLATE_API_KEY` si
esas funciones se usaran. Nunca marques secretos con prefijo `NEXT_PUBLIC_`.

Para Preview usa otra base/bucket cuando sea posible. No des a ramas no confiables
credenciales de produccion.

## 6. CORS de R2

El navegador sube directamente al bucket. Agrega el dominio final y localhost:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://drivxis.vercel.app"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## 7. Primera puesta en produccion

Orden recomendado:

1. Crear/configurar PostgreSQL y ejecutar `npm run prisma:deploy` con la URL directa.
2. Configurar R2 y su CORS.
3. Subir `best.onnx` con `npm run analysis:model:upload`.
4. Arrancar el worker y confirmar que el preflight termina correctamente.
5. Crear/importar el proyecto `drivxis` en Vercel y cargar sus variables.
6. Desplegar `main`.
7. Registrar un usuario, subir un clip corto y comprobar el ciclo
   `QUEUED -> RUNNING -> COMPLETED`.

## 8. Verificacion y rollback

Antes de subir a `main`:

```bash
npm run typecheck
npm test
npm run build
```

Si una version web falla, restaura desde **Vercel > Deployments > Rollback**. Una
migracion de base de datos no se revierte al hacer rollback de Vercel; por eso los
cambios de esquema deben ser compatibles con la version anterior durante el despliegue.
