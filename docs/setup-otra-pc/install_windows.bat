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

echo Prisma generate + migrate deploy...
call npx prisma generate || exit /b 1
call npx prisma migrate deploy || exit /b 1

echo Setup completado.
echo Luego ejecuta:
echo 1) npm run dev
echo 2) Configurar YOLO local en .env y copiar analysis/models/best.onnx
echo 3) Ejecutar npm run analysis:worker -- --once para validar.

endlocal
