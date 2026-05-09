# Cloudflare R2 - Configuracion de storage

Este proyecto usa storage compatible con S3. Cloudflare R2 funciona con el AWS SDK usando endpoint, bucket, access key y secret key.

## 1. Crear bucket

En Cloudflare:

1. Ir a **Storage & databases**.
2. Entrar a **R2**.
3. Crear un bucket.
4. Nombre recomendado:

```txt
drivxis-videos
```

## 2. Crear credenciales

En Cloudflare R2:

1. Ir a **Manage API Tokens**.
2. Crear token para R2.
3. Permiso recomendado: **Object Read & Write**.
4. Aplicar solo al bucket de DRIVXIS.
5. Copiar:
   - Access Key ID
   - Secret Access Key
   - S3 API endpoint

El endpoint tiene esta forma:

```txt
https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

## 3. Variables `.env`

Agregar o actualizar:

```env
STORAGE_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
STORAGE_REGION="auto"
STORAGE_BUCKET="drivxis-videos"
STORAGE_ACCESS_KEY_ID="<ACCESS_KEY_ID>"
STORAGE_SECRET_ACCESS_KEY="<SECRET_ACCESS_KEY>"
STORAGE_PUBLIC_BASE_URL=""
```

No pongas `/bucket-name` al final del endpoint. El bucket va separado en `STORAGE_BUCKET`.

## 4. CORS del bucket

Como el navegador sube el video directo usando una presigned URL, el bucket necesita CORS.

Configuracion recomendada para desarrollo:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Para produccion, agregar tambien tu dominio:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://tu-dominio.com"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

## 5. Flujo esperado despues del cambio

1. El usuario pide una presigned URL.
2. El navegador sube el video original a Cloudflare R2.
3. La app registra metadata en PostgreSQL.
4. El worker descarga el video original desde R2.
5. Python analiza el video localmente.
6. El worker sube a R2:
   - video procesado: `users/{userId}/analysis/{videoId}/processed.mp4`
   - metricas: `users/{userId}/analysis/{videoId}/metrics.json`
7. La app muestra el video procesado usando el endpoint interno de stream.

## 6. Verificacion

```bash
npm run typecheck
npm test
npm run build
npm run analysis:worker -- --once
```

## 7. Notas importantes

- R2 no reemplaza PostgreSQL.
- PostgreSQL sigue guardando usuarios, videos, jobs y metricas.
- R2 guarda archivos pesados: videos originales y videos procesados.
- El endpoint interno `/api/videos/:id/stream` sigue protegiendo el acceso con sesion.
- No hace falta hacer publico el bucket para que la app funcione.
