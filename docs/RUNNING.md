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

```bash
npm run analysis:worker -- --once
```

Para analisis real, instalar dependencias Python:

```bash
pip install -r analysis/requirements.txt
```

Colocar modelo YOLO en:

```txt
analysis/models/best.pt
```

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
