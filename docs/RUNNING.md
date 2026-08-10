# Ejecutar DRIVXIS en Local

## Requisitos

- Node.js LTS o version moderna.
- npm.
- PostgreSQL local o remoto.
- Python si se va a probar el analisis real.

## 1. Configurar variables de entorno

Copiar `.env.example` a `.env`:

```bash
copy .env.example .env
```

Configurar como minimo:

- `DATABASE_URL`
- `NEXTAUTH_SECRET` o `AUTH_SECRET`

Opcional para storage:

- `STORAGE_BUCKET`
- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`

Opcional para traduccion:

- `GOOGLE_TRANSLATE_API_KEY`

Si storage no esta configurado, el sistema debe funcionar con fallback local.

## 2. Instalar dependencias

```bash
npm install
```

## 3. Preparar Prisma

```bash
npm run prisma:generate
npm run prisma:migrate
```

## 4. Levantar proyecto

```bash
npm run dev
```

Abrir:

```txt
http://localhost:3000
```

## 5. Ejecutar worker de analisis

Para desarrollo local con YOLO, instala `analysis/requirements.txt`, configura `ANALYSIS_DETECTOR=yolo` y ejecuta:

```bash
npm run analysis:worker -- --once
```

Con `ANALYSIS_AUTO_START=true`, cada subida local inicia ese consumidor una vez. En produccion la app web debe usar `ANALYSIS_AUTO_START=false` y el worker separado:

```bash
cp deploy/analysis-worker.env.example deploy/analysis-worker.env
# Completar DATABASE_URL, R2 y la fuente del modelo en deploy/analysis-worker.env.
docker compose --env-file deploy/analysis-worker.env -f compose.analysis-worker.yml up -d --build
docker compose --env-file deploy/analysis-worker.env -f compose.analysis-worker.yml logs -f worker
```

El modelo ONNX se descarga desde `models/best.onnx` a un volumen persistente. El contenedor no publica puertos y puede ejecutarse en CPU; una GPU compatible con ONNX Runtime reduce sustancialmente el tiempo.

Para evaluar LocateAnything en un host Linux/H100:

```bash
cp deploy/analysis-gpu.env.example deploy/analysis-gpu.env
# Completar DATABASE_URL, R2 y HF_TOKEN en deploy/analysis-gpu.env.
docker compose --env-file deploy/analysis-gpu.env -f compose.analysis-gpu.yml up -d --build
docker compose --env-file deploy/analysis-gpu.env -f compose.analysis-gpu.yml logs -f worker-h100
```

El compose GPU reserva una GPU, exige que CUDA exponga una `H100` y conserva el checkpoint en `drivxis_hf_cache`.

Antes de consumir la cola, `scripts/start-analysis-worker.sh` valida CUDA/BF16/H100 y ejecuta `analysis/cache_model.py`. El snapshot se reutiliza desde el volumen persistente o se descarga una unica vez y queda fijado por estas variables:

```env
LOCATEANYTHING_MODEL_ID="nvidia/LocateAnything-3B"
LOCATEANYTHING_REVISION="c32291ca5e996f5a7a485845b4f57a233936bba0"
```

Antes de reclamar un job, el worker ejecuta `python analysis/check_runtime.py`. Si el entorno no cumple, termina sin cambiar el job de `QUEUED` a `RUNNING`.

Para el archivo de prueba actual (30 s, 1080p, 25 FPS), el pipeline analiza 150 frames a 5 FPS en 38 lotes. En el equipo local Ryzen 7 3700X, ONNX/CPU tardo aproximadamente 2 min 42 s; un partido de 90 minutos escalaria a varias horas, por lo que produccion debe dimensionarse y medirse con un canario.

Consultar `analysis/README.md` para instalacion local y smoke test GPU.

## 6. Verificacion antes de entregar

```bash
npm run typecheck
npm test
npm run build
```

## Problemas comunes

### Error de base de datos

Revisar:

- PostgreSQL esta levantado.
- `DATABASE_URL` tiene host, puerto, usuario, password y database correctos.
- Migraciones aplicadas.

### Redireccion a `/login`

Es normal en rutas protegidas si no hay sesion valida.

### Storage no configurado

No deberia bloquear el sistema en desarrollo. Debe usarse fallback local.

## Reglas para Codex

Cuando arregle errores de setup/build:

- Revisar `package.json`.
- Revisar `.env.example` si existe.
- No cambiar dependencias sin necesidad.
- Sugerir comandos de verificacion.
- No tocar logica de producto si el error es solo de entorno.
