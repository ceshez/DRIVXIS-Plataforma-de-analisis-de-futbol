# Documentacion de Servicios (API)

Esta version expone endpoints bajo `app/api/...` (Next.js Route Handlers). Todas las respuestas son JSON.

## Convenciones generales

- Content-Type recomendado: `application/json`
- Validacion de entrada: Zod (`lib/validators.ts`)
- Auth:
  - Los endpoints de videos requieren sesion (cookie `drivxis_session`).
  - Si no hay sesion, el servidor redirige a `/login` (esto es importante: el comportamiento es diferente a un 401 clasico).

## Auth

### 1) Registrar usuario

- **POST** `/api/auth/register`
- Body JSON:
  - `name` (string, min 2)
  - `email` (string email)
  - `password` (string, min 8)
- Respuestas:
  - `201/200`: `{ "ok": true }`
  - `400`: `{ "error": "..." }` si validacion falla
  - `409`: `{ "error": "Ya existe una cuenta con ese correo." }`
  - `500`: `{ "error": "No pudimos crear la cuenta." }`
- Efecto adicional:
  - Crea cookie de sesion `drivxis_session`

### 2) Login

- **POST** `/api/auth/login`
- Body JSON:
  - `email`
  - `password`
- Respuestas:
  - `200`: `{ "ok": true }`
  - `400`: `{ "error": "..." }`
  - `401`: `{ "error": "Correo o contrasena incorrectos." }`
- Efecto adicional:
  - Crea cookie de sesion `drivxis_session`

### 3) Logout

- **POST** `/api/auth/logout`
- Body: ninguno
- Respuesta:
  - `200`: `{ "ok": true }`
- Efecto adicional:
  - Borra la cookie de sesion

## Videos

### 4) Preparar carga (presign)

- **POST** `/api/videos/presign`
- Requiere sesion: si no hay, redirige a `/login`.
- Body JSON:
  - `filename` (string)
  - `mimeType` (string que empiece por `video/`)
  - `sizeBytes` (number, max 12GB)
- Respuesta:
  - `200`: si storage esta configurado:
    - `{ "configured": true, "objectKey": "...", "uploadUrl": "https://...", "expiresIn": 600 }`
  - `200`: si storage no esta configurado:
    - `{ "configured": false, "objectKey": "...", "uploadUrl": null, "expiresIn": 0 }`
  - `400`: `{ "error": "..." }`

### 5) Listar videos del usuario

- **GET** `/api/videos`
- Requiere sesion: si no hay, redirige a `/login`.
- Respuesta:
  - `200`: `{ "videos": [ ... ] }`
  - Cada video incluye:
    - `id`, `originalFilename`, `status`, `objectKey`
    - `sizeBytes` como string
    - `createdAt` como ISO string

### 6) Registrar metadata de un video

- **POST** `/api/videos`
- Requiere sesion: si no hay, redirige a `/login`.
- Body JSON:
  - `filename`
  - `mimeType`
  - `sizeBytes`
  - `objectKey`
  - `durationSeconds` (opcional)
- Validaciones importantes:
  - `objectKey` debe iniciar con `users/{userId}/videos/` (evita que un usuario registre una llave de otro).
- Respuesta:
  - `201`: `{ "video": { ... } }`
  - `400`: `{ "error": "..." }`
  - `403`: `{ "error": "La llave de storage no pertenece al usuario actual." }`
- Efecto adicional (pipeline demo):
  - Crea un `AnalysisJob` en estado `QUEUED`
  - Crea un `MetricSnapshot` mock (para demostrar el dashboard mientras se conecta el modelo real)

## Traduccion (i18n)

### 7) Traducir diccionario

- **POST** `/api/translate`
- Body JSON:
  - `locale` (opcional, por defecto `es`)
  - `dictionary` (objeto `{ clave: "texto" }`)
- Respuestas:
  - `200`: `{ "locale": "xx", "dictionary": { ... } }`
  - `400`: `{ "error": "Diccionario invalido." }`

## Ejemplo de flujo completo (subida/registro)

1. `POST /api/videos/presign` con info del archivo.
2. Si `uploadUrl` viene con valor, el navegador hace `PUT` a esa URL para subir el archivo al bucket.
3. `POST /api/videos` para guardar la metadata y dejar un job de analisis en cola.

