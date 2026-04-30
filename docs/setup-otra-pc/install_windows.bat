@echo off
setlocal

echo == DRIVXIS setup (Windows) ==

if not exist package.json (
  echo Ejecuta este script desde la raiz del proyecto.
  exit /b 1
)

if not exist .env (
  if exist .env.example (
    copy .env.example .env >nul
    echo Se creo .env desde .env.example. Completa variables antes de produccion.
  )
)

echo Instalando dependencias Node...
call npm install || exit /b 1

echo Creando entorno Python .venv-analysis...
py -3.12 -m venv .venv-analysis || exit /b 1

echo Instalando dependencias Python...
call .\.venv-analysis\Scripts\python.exe -m pip install --upgrade pip || exit /b 1
call .\.venv-analysis\Scripts\python.exe -m pip install -r analysis\requirements.txt || exit /b 1

echo Prisma generate + migrate deploy...
call npx prisma generate || exit /b 1
call npx prisma migrate deploy || exit /b 1

echo Verificando imports Python...
call .\.venv-analysis\Scripts\python.exe -c "import cv2, numpy, supervision, sklearn, ultralytics, imageio_ffmpeg; print('python ok')" || exit /b 1

echo Setup completado.
echo Luego ejecuta:
echo 1) npm run dev
echo 2) npm run analysis:worker

endlocal
