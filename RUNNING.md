# Como Ejecutar el Sistema (Local)

Este documento es el paso a paso para levantar DRIVXIS en tu computadora.

## Requisitos previos

- Node.js (recomendado: version moderna LTS)
- npm (viene con Node)
- Una base de datos **PostgreSQL** accesible (local o remota)

## 1) Configurar variables de entorno

1. Copia el archivo de ejemplo:

```bash
copy .env.example .env
```

2. Abre `.env` y configura como minimo:

- `DATABASE_URL`
- `NEXTAUTH_SECRET` (o `AUTH_SECRET`)

Opcional (solo si quieres probar el flujo de subir el archivo real al bucket):

- `STORAGE_BUCKET`
- `STORAGE_ENDPOINT`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`

Opcional (solo si quieres traduccion runtime):

- `GOOGLE_TRANSLATE_API_KEY`

Nota: si no configuras storage, el sistema igual funciona, pero solo guarda metadata de videos.

## 2) Instalar dependencias

```bash
npm install
```

## 3) Preparar Prisma y la base de datos

1. Genera el cliente de Prisma:

```bash
npm run prisma:generate
```

2. Crea/aplica migraciones en tu PostgreSQL:

```bash
npm run prisma:migrate
```

Si la conexion falla, revisa `DATABASE_URL`.

## 4) Levantar el proyecto

```bash
npm run dev
```

Abre:

- `http://localhost:3000`

## 5) Verificacion (recomendado antes de entregar)

```bash
npm run typecheck
npm test
npm run build
```

## Problemas comunes (rapido)

- "No se pudo conectar a la BD":
  - Confirma que PostgreSQL este levantado y que `DATABASE_URL` tenga host/puerto/usuario/password correctos.
- "Me redirige a /login cuando llamo /api/videos":
  - Es normal: esos endpoints requieren sesion; primero registrate o inicia sesion.

