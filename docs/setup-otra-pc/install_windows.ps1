Param(
  [string]$PythonVersion = "3.12"
)

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

Write-Host "Creando entorno Python .venv-analysis..."
py -$PythonVersion -m venv .venv-analysis

Write-Host "Instalando dependencias Python..."
.\.venv-analysis\Scripts\python.exe -m pip install --upgrade pip
.\.venv-analysis\Scripts\python.exe -m pip install -r analysis\requirements.txt

Write-Host "Prisma generate + migrate deploy..."
npx prisma generate
npx prisma migrate deploy

Write-Host "Verificando imports Python..."
.\.venv-analysis\Scripts\python.exe -c "import cv2, numpy, supervision, sklearn, ultralytics, imageio_ffmpeg; print('python ok')"

Write-Host "Setup completado."
Write-Host "Siguiente paso:"
Write-Host "1) npm run dev"
Write-Host "2) npm run analysis:worker"
