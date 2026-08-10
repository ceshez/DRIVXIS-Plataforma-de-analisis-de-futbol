# Que descargar para ejecutar en otra computadora

## Aplicacion web

1. Git for Windows: <https://git-scm.com/download/win>
2. Node.js LTS: <https://nodejs.org/>
3. Python 3.11 o 3.12 para el worker YOLO local: <https://www.python.org/downloads/>
4. PostgreSQL local o remoto: <https://www.postgresql.org/download/>

## Analisis YOLO

El detector predeterminado funciona en Windows/Linux y CPU/GPU. Necesita:

- Las dependencias de `analysis/requirements.txt`.
- `best.onnx` en `analysis/models` para local o en R2 como `models/best.onnx` para el contenedor.
- Acceso a PostgreSQL y Cloudflare R2/S3.

LocateAnything sigue disponible opcionalmente con `Dockerfile.analysis-gpu` y requiere Linux/CUDA y al menos 24 GB de VRAM.

## Verificacion rapida

```powershell
node -v
npm -v
python --version
```

Despues continua con `INSTALAR_Y_PROBAR.md` y `analysis/README.md`.
