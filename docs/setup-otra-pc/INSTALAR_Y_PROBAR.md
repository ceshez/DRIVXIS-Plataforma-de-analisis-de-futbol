# Instalar y probar en otra computadora (Windows)

## 1) Clonar proyecto
```powershell
git clone <URL_DEL_REPO>
cd DRIVXIS-Plataforma-de-analisis-de-futbol
```

## 2) Configurar variables de entorno
1. Copia `.env.example` a `.env`
2. Completa:
- `DATABASE_URL`
- `PYTHON_BIN` (recomendado: `.venv-analysis/Scripts/python.exe`)
- `ANALYSIS_MODEL_PATH` (`analysis/models/best.pt`)
- `LOCAL_STORAGE_ROOT`
- `ANALYSIS_STORAGE_ROOT`

## 3) Instalar dependencias Node
```powershell
npm install
```

## 4) Instalar dependencias Python de análisis
```powershell
py -3.12 -m venv .venv-analysis
.\.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
.\.venv-analysis\Scripts\python.exe -m pip install -r analysis\requirements.txt
```

## 5) Preparar base de datos
```powershell
npx prisma migrate deploy
npx prisma generate
```

Si estás en desarrollo nuevo:
```powershell
npx prisma migrate dev
```

## 6) Verificación técnica
```powershell
.\.venv-analysis\Scripts\python.exe -c "import cv2, numpy, supervision, sklearn, ultralytics, imageio_ffmpeg; print('python ok')"
npm run typecheck
npm test
```

## 7) Levantar app y worker
Terminal 1:
```powershell
npm run dev
```

Terminal 2:
```powershell
npm run analysis:worker
```

## 8) Prueba funcional
1. Abrir `http://localhost:3000`
2. Subir un video.
3. Confirmar estados: `pending analysis -> processing -> completed`.
4. Confirmar que se ve el video procesado.

## Troubleshooting corto
1. Si falla OpenCV o YOLO:
- Reinstalar requirements en `.venv-analysis`.

2. Si worker no arranca:
- Verificar `PYTHON_BIN` en `.env`.

3. Si no aparecen videos:
- Revisar `DATABASE_URL` y migraciones Prisma.
