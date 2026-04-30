# DRIVXIS | Plataforma de Analisis de Futbol

DRIVXIS es una plataforma web para registrar videos de partidos y generar analitica tactica/fisica a partir del video. En esta version, el sistema ya incluye autenticacion, un dashboard protegido, una biblioteca de videos, subida local/S3 y una cola de analisis que conecta un motor Python basado en YOLO.

## Objetivo del proyecto

1. Centralizar el proceso de analisis: login, subida/registro de material y visualizacion de estadisticas.
2. Conectar un modelo de vision computacional basado en YOLO a un pipeline de analisis (jobs + snapshots de metricas).
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
- IA local: Python + YOLO/Ultralytics + OpenCV + Supervision + scikit-learn
- Testing (basico): Vitest

## Instrucciones para ejecutar el sistema (local)

Las instrucciones completas estan en [`RUNNING.md`](./RUNNING.md). Resumen rapido:

```bash
npm install
copy .env.example .env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Luego abre `http://localhost:3000`.

## Como se usa 

1. Entra a la landing (`/`) y luego ve a `Iniciar sesion` o `Registrarse`.
2. Al registrarte/iniciar sesion, el servidor crea una cookie `drivxis_session` con tu identidad (firmada, expira en 7 dias).
3. El dashboard (`/dashboard`) y la seccion de videos (`/dashboard/videos`) estan protegidos: si no hay sesion valida, redirige a `/login`.
4. En `Panel`, haces click en la consola principal para subir un partido:
   - Pide un "presign" a `POST /api/videos/presign` (prepara la carga al storage).
   - Si el storage esta configurado, el navegador sube el archivo directo al bucket con `PUT` a la URL firmada.
   - Si no hay storage, el navegador sube el archivo a storage local con `PUT /api/videos/local-upload`.
   - Luego registra la metadata en la BD con `POST /api/videos`, y el sistema crea un `AnalysisJob` en cola.
5. Ejecuta el worker para procesar la cola:

```bash
npm run analysis:worker -- --once
```

Para analizar videos reales instala dependencias Python con `pip install -r analysis/requirements.txt` y coloca el peso YOLO en `analysis/models/best.pt`.

## Capturas



Cuando las agregues, el README las mostrara:


## Documentacion adicional

- Arquitectura del sistema: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- Diseno de base de datos: [`DATABASE.md`](./DATABASE.md)
- Servicios / endpoints: [`API.md`](./API.md)
- Ejecucion local (paso a paso): [`RUNNING.md`](./RUNNING.md)
- Mejoras futuras: [`FUTURE_IMPROVEMENTS.md`](./FUTURE_IMPROVEMENTS.md)

## Nota sobre videos (storage)

Los partidos completos no se guardan en PostgreSQL. La app guarda metadata y una `objectKey` por usuario. Si el storage S3 no esta configurado, DRIVXIS usa `.drivxis/uploads` para desarrollo local y `.drivxis/analysis` para videos anotados y metricas generadas.
