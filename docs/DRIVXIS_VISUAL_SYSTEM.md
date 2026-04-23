# DRIVXIS Visual System

Esta guía resume el estilo aplicado durante la migración del diseño de Figma Make. Úsala como referencia para mantener futuras pantallas consistentes.

## Dirección

- Producto para entrenadores, analistas y academias que revisan videos de fútbol.
- Personalidad directa, técnica, competitiva y de alto rendimiento.
- Interfaz dark-first con estética industrial: negro, naranja táctico, líneas finas, grilla global y brillo muy contenido.
- Evitar estilo SaaS genérico: gradientes morado/azul, tarjetas redondeadas suaves, iconos decorativos innecesarios y tipografía excesivamente grande.

## Tokens Visuales

- Fondo principal: `#080808`.
- Paneles: `#0b0b0b`; superficies elevadas: `#10100f`.
- Acento: `#ff6b2b`; hover: `#ff8c4a`.
- Texto principal: `#f2f0ee`; texto secundario con blanco a `0.28-0.48` de opacidad.
- Bordes estructurales: naranja a `0.10-0.18` de opacidad.
- Bordes activos/focus: naranja a `0.30-0.42`.
- Radio: `2px` por defecto.
- Tipografía: `Orbitron` para display, números y etiquetas tácticas; `Inter` para texto y controles.

## Layout

- La grilla táctica debe cubrir todo el ancho y alto del documento, especialmente en monitores grandes.
- El contenido puede ir en contenedores centrados, pero el fondo no debe cortarse visualmente.
- Preferir bandas horizontales, divisores finos, layouts asimétricos y paneles densos para dashboard.
- No envolver todo en cards; usar bordes, separación y líneas de grilla como estructura.
- El logo del header debe ser proporcional y no dominar la navegación.
- El footer debe usar el logo real, no texto plano.

## Landing

- Hero centrado con wordmark DRIVXIS, badge técnico pequeño, un CTA primario y uno secundario.
- Métricas como banda full-width con divisores finos.
- Proceso en cuatro pasos compactos.
- Capacidades en grid de dos columnas con índices grandes de baja opacidad.
- Indicadores técnicos en desktop: dos columnas, barras largas, labels compactos y valores alineados a la derecha.
- CTA final sin icono de persona; usar glow sutil detrás del título y flecha en el botón.
- Testimonios sin iconos decorativos.

## Cancha Táctica

- Estilo de plano técnico: fondo negro, líneas naranja sutiles, borde fino, jugadores pequeños.
- Equipo principal en naranja; rival en gris/blanco de baja opacidad.
- Etiquetas tácticas pequeñas como `DF`, `MC`, `EX`, `DC`.
- Medidas pequeñas opcionales en naranja tenue.
- Evitar fondos azulados o heatmaps pesados en la landing.

## Dashboard

- No saltarse `requireUser()`, Prisma, auth ni APIs reales en rutas productivas.
- Usar `/dashboard/demo` solo para preview visual sin base de datos.
- Mantener paneles compactos: command band, analysis stage, panel lateral, stat strip, charts y videos recientes.
- `recharts` debe vivir en componentes client; páginas server hacen auth y data fetching.
- Estados como chips pequeños con borde, no badges grandes.

## Checklist

- Revisar monitor ancho de 27 pulgadas para asegurar continuidad de grilla.
- Revisar mobile para que header/logo no consuman demasiado viewport.
- Antes de cerrar cambios UI: ejecutar `npm run typecheck`, `npm test` y `npm run build`.
