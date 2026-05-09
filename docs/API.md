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

### Listar videos

```txt
GET /api/videos
```

Requiere sesion.

Devuelve videos del usuario actual.

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

### Stream de video

```txt
GET /api/videos/:id/stream?variant=source|annotated
```

Debe devolver archivo local original o anotado, con soporte basico de `Range` si aplica.

### Reencolar analisis

```txt
POST /api/videos/:id/analysis/retry
```

Debe crear un nuevo `AnalysisJob` en estado `QUEUED`.

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

## Reglas para Codex

Cuando cree o modifique endpoints:

- Leer `AGENTS.md`.
- Leer `docs/ARCHITECTURE.md`.
- Usar Zod si hay body/query params.
- Respetar la sesion actual.
- No cambiar contratos existentes sin necesidad.
- No tocar Prisma schema salvo que sea parte explicita de la tarea.
- Documentar cambios si cambia el contrato de API.
