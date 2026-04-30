# Qué descargar para ejecutar en otra computadora

## Requerido
1. Git for Windows:
- [https://git-scm.com/download/win](https://git-scm.com/download/win)

2. Node.js LTS (incluye npm):
- [https://nodejs.org/](https://nodejs.org/)

3. Python 3.11 o 3.12 (recomendado para análisis):
- [https://www.python.org/downloads/](https://www.python.org/downloads/)

4. PostgreSQL (local o remoto):
- [https://www.postgresql.org/download/](https://www.postgresql.org/download/)

## Opcional (recomendado)
1. ffmpeg global (aunque el proyecto ya usa `imageio-ffmpeg` en Python):
- [https://ffmpeg.org/download.html](https://ffmpeg.org/download.html)

2. Visual Studio Build Tools (si alguna dependencia nativa lo pide):
- [https://visualstudio.microsoft.com/visual-cpp-build-tools/](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

## Archivos del proyecto que debes llevar
- Todo el repositorio (ideal: `git clone`).
- Archivo `.env` con tus variables reales.
- Si quieres probar exactamente como aquí:
  - `analysis/models/best.pt`

## Verificación rápida después de instalar
Ejecuta en PowerShell dentro del proyecto:

```powershell
node -v
npm -v
python --version
```

Si todo responde, continúa con `INSTALAR_Y_PROBAR.md`.
