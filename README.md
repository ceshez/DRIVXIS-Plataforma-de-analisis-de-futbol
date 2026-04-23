# DRIVXIS-Plataforma de analisis de futbol

DRIVXIS es una plataforma web de analisis de partidos de futbol usando modelos de
reconocimiento como YOLOv8 para extraer estadisticas y datos de videos de futbol.

## V1 web platform

La primera version es una app fullstack con Next.js, TypeScript, Prisma y PostgreSQL.
Incluye landing page, registro publico, login, dashboard protegido, demo tactica mock,
biblioteca de videos y adaptador para storage S3-compatible.

## Setup local

1. Instala dependencias:

```bash
npm install
```

2. Copia `.env.example` a `.env` y configura `DATABASE_URL`,
   `NEXTAUTH_SECRET`, credenciales de storage y `GOOGLE_TRANSLATE_API_KEY`
   si quieres traduccion runtime.

3. Genera Prisma y aplica migraciones:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Levanta la app:

```bash
npm run dev
```

## Verificacion

```bash
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

## Storage de videos

Los partidos completos no se guardan en PostgreSQL. La app genera llaves por usuario
para un bucket S3/R2/MinIO y guarda solo metadata en Prisma. Si las credenciales de
storage no estan configuradas, el flujo conserva la metadata para desarrollo local.
