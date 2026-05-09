# Guia UI - DRIVXIS

Este documento ayuda a mantener una interfaz consistente cuando Codex modifique pantallas o componentes.

## Personalidad visual

DRIVXIS debe sentirse:

- Tecnologico.
- Deportivo.
- Limpio.
- Profesional.
- Enfocado en datos.

No debe sentirse como una plantilla generica ni como una app escolar basica.

## Principios de interfaz

- Priorizar claridad sobre decoracion excesiva.
- Mostrar estados del sistema de forma visible.
- Usar tarjetas, paneles y layouts limpios para metricas.
- Mantener buena jerarquia visual: titulo, descripcion, accion principal.
- Evitar saturar pantallas con demasiadas metricas al mismo tiempo.
- En mobile, las secciones deben apilarse de forma natural.

## Componentes comunes

### Cards de metricas

Deben incluir:

- Titulo corto.
- Valor principal.
- Descripcion o cambio secundario.
- Estado visual si aplica.

### Estados de video

Usar etiquetas claras para:

- `UPLOADED`
- `PENDING_ANALYSIS`
- `PROCESSING`
- `COMPLETED`
- `FAILED`

El usuario debe entender rapidamente si el video ya esta listo o si falta procesarlo.

### Botones

- Accion principal: visible y directa.
- Acciones secundarias: menos prominentes.
- Evitar multiples botones principales compitiendo en la misma seccion.

### Formularios

- Labels claros.
- Errores visibles.
- No esconder informacion importante en placeholders.
- Mantener validaciones coherentes con Zod.

## Reglas para Codex

Cuando trabaje UI:

- Usar Tailwind CSS.
- Mantener componentes responsivos.
- No cambiar logica de datos si solo se pidio diseno.
- No tocar Prisma, auth, storage ni worker si la tarea es visual.
- Preservar nombres de props y contratos existentes salvo que sea necesario.
- No instalar librerias nuevas sin pedirlo explicitamente.

## Checklist antes de terminar UI

- La pantalla se entiende en desktop.
- La pantalla se entiende en mobile.
- Hay estados vacios, loading o error cuando aplica.
- Los botones explican bien la accion.
- No se rompio el flujo existente.
