# DRIVXIS | Plataforma de Analisis de Futbol

DRIVXIS es una plataforma web para registrar videos de partidos y generar (o simular) analitica tactica/fisica a partir del video. En esta version, el sistema ya incluye autenticacion, un dashboard protegido, una biblioteca de videos y un flujo de carga que guarda metadata en base de datos y opcionalmente sube el archivo real a un storage compatible con S3.

## Objetivo del proyecto

1. Centralizar el proceso de analisis: login, subida/registro de material y visualizacion de estadisticas.
2. Dejar lista la base para conectar un modelo de vision computacional (por ejemplo, YOLO) a un pipeline de analisis (jobs + snapshots de metricas).
3. Entregar un sistema funcional y documentado, aplicando buenas practicas (validaciones, capas, estructura, persistencia con ORM, endpoints claros).

## Tecnologias utilizadas

- Frontend/Fullstack: Next.js (App Router) + React + TypeScript
- Estilos: Tailwind CSS
- Backend/API: Route Handlers de Next.js (`app/api/...`)
- Base de datos: PostgreSQL
- ORM: Prisma
- Validacion: Zod
- Seguridad: hashing de password con bcryptjs + cookie de sesion firmada (HMAC)
- Storage (opcional): AWS SDK S3 (compatible con S3/R2/MinIO)
- Testing (basico): Vitest

## Instrucciones para ejecutar el sistema (local, sin Docker)

Las instrucciones completas estan en [`RUNNING.md`](./RUNNING.md). Resumen rapido:

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Luego abre `http://localhost:3000`.

## Como se usa (explicado simple)

1. Entra a la landing (`/`) y luego ve a `Iniciar sesion` o `Registrarse`.
2. Al registrarte/iniciar sesion, el servidor crea una cookie `drivxis_session` con tu identidad (firmada, expira en 7 dias).
3. El dashboard (`/dashboard`) y la seccion de videos (`/dashboard/videos`) estan protegidos: si no hay sesion valida, redirige a `/login`.
4. En `Videos`, registras un archivo:
   - Pide un "presign" a `POST /api/videos/presign` (prepara la carga al storage).
   - Si el storage esta configurado, el navegador sube el archivo directo al bucket con `PUT` a la URL firmada.
   - Luego registra la metadata en la BD con `POST /api/videos`, y el sistema crea un `AnalysisJob` (en cola) y un `MetricSnapshot` (demo/mock).

## Evidencia visual (capturas)

Guarda tus capturas en `docs/screenshots/` con estos nombres para que aparezcan aqui:

- `docs/screenshots/01-landing.png`
- `docs/screenshots/02-register.png`
- `docs/screenshots/03-login.png`
- `docs/screenshots/04-dashboard.png`
- `docs/screenshots/05-videos.png`

Cuando las agregues, el README las mostrara:

![Landing](docs/screenshots/01-landing.png)
![Registro](docs/screenshots/02-register.png)
![Login](docs/screenshots/03-login.png)
![Dashboard](docs/screenshots/04-dashboard.png)
![Videos](docs/screenshots/05-videos.png)

## Documentacion adicional

- Arquitectura del sistema: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Diseno de base de datos: [`DATABASE.md`](./DATABASE.md)
- Servicios / endpoints: [`API.md`](./API.md)
- Ejecucion local (paso a paso): [`RUNNING.md`](./RUNNING.md)
- Mejoras futuras: [`FUTURE_IMPROVEMENTS.md`](./FUTURE_IMPROVEMENTS.md)

## Nota sobre videos (storage)

Los partidos completos no se guardan en PostgreSQL. La app guarda metadata y una `objectKey` por usuario. Si el storage no esta configurado, el sistema igual permite registrar metadata para que el flujo sea demostrable en local; solo que no sube el archivo real al bucket.
