# Proximo trabajo: porteros y metricas visuales

Fecha de referencia: 2026-05-02

## Contexto

La asignacion de equipos por color ya mejoro y el modelo esta manteniendo mejor la identidad de los jugadores durante cruces. El siguiente bloque de trabajo debe enfocarse en dos areas:

- Mejorar la deteccion/asignacion de porteros.
- Mostrar velocidad y distancia recorrida en el video solo cuando la muestra sea confiable.

No correr pruebas pesadas con videos completos. La validacion final se hara manualmente desde la aplicacion subiendo un video.

## Objetivo 1: Mejorar deteccion de porteros

Problema actual:

- Todavia pueden aparecer 2 porteros asignados al equipo verde.
- El sistema necesita distinguir mejor entre porteros reales y jugadores de campo que quedan cerca del arco.

Trabajo propuesto:

1. Forzar unicidad tactica:
   - Maximo 2 porteros total.
   - Maximo 1 portero por lado/arco.
   - Maximo 1 portero por equipo.

2. Seleccionar porteros por contexto de arco antes que por color:
   - Separar candidatos por lado izquierdo/derecho del campo.
   - Elegir el mejor candidato de cada lado usando permanencia, profundidad cerca del arco y baja movilidad lateral.
   - Asignar el equipo segun el arco que defiende, no solo por camiseta.

3. Reducir falsos positivos:
   - No marcar como portero a jugadores que solo pasan cerca del arco pocos frames.
   - Penalizar candidatos que se mueven como jugadores de campo.
   - Penalizar candidatos que aparecen en zonas centrales.

4. Mantener una salida limpia:
   - No mostrar lista de porteros en dashboard.
   - Usar la deteccion solo para mejorar calculos, color/equipo y overlay.

Archivos principales:

- `analysis/pipeline/goalkeepers.py`
- `analysis/pipeline/tracker.py`
- `analysis/tests/test_pipeline.py`

## Objetivo 2: Mostrar velocidad y distancia en el video

Problema actual:

- La velocidad/distancia no debe aparecer debajo de todos los jugadores.
- Debe mostrarse solo cuando el sistema tenga muestras confiables.

Trabajo propuesto:

1. Mantener el overlay por jugador:
   - Mostrar velocidad en `km/h`.
   - Mostrar distancia en `m` o `km` segun magnitud.
   - Ubicarlo debajo del jugador sin ensuciar demasiado el video.

2. Filtrar muestras no confiables:
   - No mostrar datos si el jugador tiene pocos frames validos.
   - No mostrar datos si hubo salto brusco por tracking.
   - No mostrar datos si el ID fue fragmentado o acaba de reaparecer.

3. Mejorar legibilidad:
   - Usar una caja pequena o texto con borde.
   - Evitar que muchos overlays se encimen.
   - Si hay mucha densidad de jugadores, priorizar jugadores con datos mas confiables.

Archivos principales:

- `analysis/pipeline/speed_distance.py`
- `analysis/pipeline/annotator.py`
- `analysis/tests/test_pipeline.py`

## Validacion ligera sugerida

Ejecutar solo pruebas rapidas:

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'; python -m unittest analysis.tests.test_pipeline
npm run typecheck
npm test
```

No ejecutar analisis completo de video desde Codex.

## Criterios de listo

- No aparecen 2 porteros para el mismo equipo.
- No hay mas de 2 porteros total.
- El portero blanco y el portero verde se asignan al equipo correcto segun contexto de arco.
- Los jugadores mantienen equipo durante cruces.
- El video muestra velocidad/distancia solo en jugadores con datos confiables.
- El dashboard sigue mostrando solo metricas globales, sin tablas individuales.
