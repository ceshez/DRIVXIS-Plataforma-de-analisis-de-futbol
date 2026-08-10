# API - DRIVXIS

DRIVXIS expone endpoints bajo:

```txt
app/api/**/route.ts
```

Todas las respuestas principales son JSON, excepto rutas de stream/upload cuando aplica.

## Convenciones

- Validar entrada con Zod.
- Usar Prisma para persistencia.
- Mantener auth con cookie `drivxis_session`.
- Los endpoints de videos requieren sesion.
- No inventar contratos nuevos sin revisar el codigo existente.

## Auth

### Registrar usuario

```txt
POST /api/auth/register
```

Body:

- `name`
- `email`
- `password`

Efecto:

- Crea usuario.
- Crea cookie de sesion.

### Login

```txt
POST /api/auth/login
```

Body:

- `email`
- `password`

Efecto:

- Valida credenciales.
- Crea cookie de sesion.

### Logout

```txt
POST /api/auth/logout
```

Efecto:

- Borra cookie de sesion.

### Solicitar recuperacion de contraseña

```txt
POST /api/auth/password/forgot
```

Body:

- `email`

Devuelve siempre un mensaje generico para no revelar si una cuenta existe. Si el correo esta registrado, crea un codigo de seis digitos con vigencia de 15 minutos y lo envia mediante Resend. En desarrollo sin proveedor configurado, la respuesta incluye `developmentCode` para pruebas locales.

### Restablecer contraseña con codigo

```txt
POST /api/auth/password/reset
```

Body:

- `email`
- `code`
- `newPassword`

El codigo es de un solo uso, admite un maximo de cinco intentos e invalida las sesiones anteriores al cambiar la contraseña.

## Perfil y preferencias

### Actualizar perfil

```txt
PATCH /api/profile
```

Permite cambiar `name` y `email`. Para cambiar el correo exige `currentPassword`.

### Cambiar contraseña autenticada

```txt
POST /api/profile/password
```

Requiere `currentPassword` y `newPassword`; al completarse invalida las sesiones anteriores.

### Guardar idioma y tema

```txt
PATCH /api/profile/preferences
```

Acepta `locale` (`es` o `en`) y/o `theme` (`dark` o `light`). Guarda la preferencia en la cuenta y en cookies de interfaz.

## Videos

### Preparar carga

```txt
POST /api/videos/presign
```

Requiere sesion.

Body:

- `filename`
- `mimeType`
- `sizeBytes`

Respuesta si storage esta configurado:

- `configured: true`
- `objectKey`
- `uploadUrl`
- `expiresIn`

Respuesta si storage no esta configurado:

- `configured: false`
- `objectKey`
- `uploadUrl: null`
- `expiresIn: 0`

Respuesta si excede cuota:

- HTTP `403`
- `error: "Storage limit exceeded."`
- `storage.usedBytes`
- `storage.limitBytes`
- `storage.remainingBytes`

### Listar videos

```txt
GET /api/videos
```

Requiere sesion.

Devuelve videos del usuario actual.

Admite busqueda, filtros y paginacion con los parametros:

- `q`: nombre de archivo.
- `status`: estado exacto del video.
- `dateFrom` / `dateTo`: rango de fecha `YYYY-MM-DD`.
- `minSizeMb` / `maxSizeMb`: rango de tamaño.
- `sort`: `newest`, `oldest`, `name-asc` o `name-desc`.
- `page`: pagina desde 1.
- `limit`: 1 a 50 resultados.

La respuesta incluye `pagination` con `page`, `pageSize`, `totalItems` y `totalPages`.

### Registrar metadata de video

```txt
POST /api/videos
```

Requiere sesion.

Body:

- `filename`
- `mimeType`
- `sizeBytes`
- `objectKey`
- `uploadMode`
- `durationSeconds`

Reglas:

- `objectKey` debe pertenecer al usuario actual.
- Revalida cuota en backend aunque el cliente no pase por `presign`.
- Debe crear un `AnalysisJob` en cola.

### Upload local

```txt
PUT /api/videos/local-upload?objectKey=...
```

Requiere sesion.

Uso:

- Fallback cuando storage S3/R2/MinIO no esta configurado.

### Detalle de video

```txt
GET /api/videos/:id
```

Debe devolver:

- metadata del video
- ultimo job
- ultimo snapshot de metricas

### Uso de storage por usuario

```txt
GET /api/storage/usage
```

Requiere sesion.

Devuelve:

- `usedBytes`
- `limitBytes`
- `remainingBytes`
- `percentUsed`

### Diagnostico seguro de storage

```txt
GET /api/storage/debug
```

Requiere sesion.

Devuelve:

- `configured`
- `endpointHost`
- `bucketName`
- `region`
- `hasAccessKey`
- `hasSecretKey`
- `warnings`

### Check server-side de conectividad storage

```txt
GET /api/storage/check
```

Requiere sesion.

Devuelve:

- `ok`
- `message`
- `errorName`/`errorCode` cuando falla
- `httpStatusCode` y `details` sanitizado cuando aplica

### Stream de video

```txt
GET /api/videos/:id/stream?variant=source|annotated
```

Debe devolver archivo local original o anotado, con soporte basico de `Range` si aplica.

### Eliminar video

```txt
DELETE /api/videos/:id
```

Requiere sesion.

Comportamiento:

- Verifica propiedad del video.
- Elimina objetos remotos asociados (original/procesado/metricas) en R2.
- Si falla la eliminacion remota, no elimina el registro DB.
- Ajusta `storageUsedBytes` sin permitir valores negativos.
- Limpia archivos locales gestionados cuando existen.

### Reencolar analisis

```txt
POST /api/videos/:id/analysis/retry
```

Debe crear un nuevo `AnalysisJob` en estado `QUEUED`.

Rechaza con HTTP `409` si el video ya tiene un job `QUEUED` o `RUNNING`.

### Cancelar analisis

```txt
POST /api/videos/:id/analysis/cancel
```

Requiere sesion y propiedad sobre el video.

Comportamiento:

- Cancela los jobs `QUEUED` o `RUNNING` del video.
- Conserva el video original y devuelve el video a estado `UPLOADED`.
- El worker detiene el proceso Python de un job en ejecucion y evita publicar sus resultados.
- Devuelve HTTP `409` con `ANALYSIS_NOT_ACTIVE` cuando ya no existe un analisis activo.
- El analisis cancelado puede reencolarse posteriormente con el endpoint de reintento.

### Descargar reporte de análisis

```txt
GET /api/videos/:id/analysis/report
```

Requiere sesión y propiedad sobre el video. Devuelve un PDF descargable, con la identidad visual de DRIVXIS y las métricas más relevantes del último análisis completado. Mientras el análisis no haya terminado, responde `409`.

## Traduccion

### Traducir diccionario

```txt
POST /api/translate
```

Body:

- `locale`
- `dictionary`

Uso:

- Traducir textos de UI si existe API key.
- Usar cache para evitar llamadas repetidas.

## Flujo completo de subida

1. `POST /api/videos/presign`
2. Si hay `uploadUrl`, subir al bucket con `PUT`.
3. Si no hay storage, usar upload local.
4. `POST /api/videos` para guardar metadata.
5. Se crea `AnalysisJob`.
6. Worker procesa el video.
7. UI consulta resultados.

## Cuotas de storage

- El limite se valida en `presign` y se valida de nuevo en `POST /api/videos`.
- La cuota no depende de valores enviados por el frontend.
- El worker suma uso de salida procesada al completar uploads remotos.
- El borrado de videos descuenta uso de original/procesado/metricas.

## Reglas para Codex

Cuando cree o modifique endpoints:

- Leer `AGENTS.md`.
- Leer `docs/ARCHITECTURE.md`.
- Usar Zod si hay body/query params.
- Respetar la sesion actual.
- No cambiar contratos existentes sin necesidad.
- No tocar Prisma schema salvo que sea parte explicita de la tarea.
- Documentar cambios si cambia el contrato de API.
