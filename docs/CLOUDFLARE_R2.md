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

Como el navegador sube el video directo usando una presigned URL (`PUT`), el bucket necesita CORS.

Configuracion recomendada:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR-PRODUCTION-DOMAIN"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Notas importantes:

- Si usas headers extra en el `PUT` (por ejemplo checksums o metadata), debes agregarlos en `AllowedHeaders`.
- Los presigned URLs de R2 deben usar el dominio S3 API `<ACCOUNT_ID>.r2.cloudflarestorage.com`.
- No usar `r2.dev` ni custom domains para firmar/usar presigned `PUT` de R2.

## 4.1 Debug rapido en navegador (cuando aparece "Browser network error during presigned PUT")

En DevTools -> Network:

1. Buscar la request `OPTIONS` al presigned URL:
   - Debe responder `2xx`.
   - Si falla o no responde, el problema suele ser CORS/politica del bucket.
2. Si `OPTIONS` pasa, revisar la request `PUT`:
   - `403` suele indicar `SignatureDoesNotMatch` o mismatch de headers firmados (incluyendo `Content-Type`).
   - `400` suele indicar request mal formada o endpoint/config incorrecta.
3. Confirmar que el `Content-Type` enviado en `PUT` coincide exactamente con el `signedContentType` devuelto por `/api/videos/presign`.

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

## 5.1 Cuotas por usuario

- Cada usuario tiene `storageLimitBytes` y `storageUsedBytes`.
- La cuota se valida en backend antes de generar presign y se revalida al registrar metadata.
- Si se excede, la API responde `403 Storage limit exceeded`.
- La cuota del frontend es solo lectura (`/api/storage/usage`); el cliente no la puede editar.

## 5.2 Contabilidad de uso

- Al registrar video original se suma `sizeBytes`.
- El worker sube `processed.mp4` y `metrics.json` a R2 y guarda:
  - `processedObjectKey`
  - `latestMetricsObjectKey`
  - `processedSizeBytes`
  - `metricsSizeBytes`
- En reanalisis, se aplica delta para evitar doble conteo.

## 5.3 Eliminacion remota

- Al eliminar un video, la app intenta borrar en R2:
  - objeto original
  - objeto procesado/anotado
  - objeto de metricas
- Si la eliminacion remota falla, la API no elimina el registro en DB (consistencia primero).
- Despues de eliminar correctamente, se descuenta cuota del usuario.

## 6. Verificacion

```bash
npm run typecheck
npm test
npm run build
docker compose --env-file deploy/analysis-worker.env \
  -f compose.analysis-worker.yml up -d --build
```

## 6.1 Prueba manual con presigned URL (debug local)

1. Genera una presigned URL desde la app (`POST /api/videos/presign`).
2. Usala solo para debugging local y no la compartas ni la subas al repo.
3. Prueba el PUT con `curl`:

```bash
curl -X PUT "PRESIGNED_URL" -H "Content-Type: video/mp4" --data-binary @sample.mp4
```

Interpretacion rapida:

- Si `curl` funciona pero el navegador falla, el problema suele ser CORS o headers del browser.
- Si `curl` falla con `403`, suele ser firma (`SignatureDoesNotMatch`), `Content-Type` distinto, credenciales, endpoint o bucket.

## 7. Notas importantes

- R2 no reemplaza PostgreSQL.
- PostgreSQL sigue guardando usuarios, videos, jobs y metricas.
- R2 guarda archivos pesados: videos originales y videos procesados.
- El endpoint interno `/api/videos/:id/stream` sigue protegiendo el acceso con sesion.
- No hace falta hacer publico el bucket para que la app funcione.
- La cuota de storage nunca se confia al frontend.
