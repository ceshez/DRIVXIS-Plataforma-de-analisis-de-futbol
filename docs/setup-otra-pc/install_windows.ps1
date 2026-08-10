$ErrorActionPreference = "Stop"

Write-Host "== DRIVXIS setup (Windows) =="

if (-not (Test-Path "package.json")) {
  throw "Ejecuta este script desde la raiz del proyecto."
}

if (-not (Test-Path ".env")) {
  if (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env"
    Write-Host "Se creo .env desde .env.example. Completa variables antes de ejecutar en produccion."
  } else {
    Write-Host "No existe .env ni .env.example."
  }
}

Write-Host "Instalando dependencias Node..."
npm install

Write-Host "Prisma generate + migrate deploy..."
npx prisma generate
npx prisma migrate deploy

Write-Host "Setup completado."
Write-Host "Siguiente paso:"
Write-Host "1) npm run dev"
Write-Host "2) Configurar YOLO local en .env y copiar analysis/models/best.onnx"
Write-Host "3) Ejecutar npm run analysis:worker -- --once para validar."
