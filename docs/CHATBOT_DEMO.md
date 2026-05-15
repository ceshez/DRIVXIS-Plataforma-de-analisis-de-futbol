# Chatbot Demo - Dashboard DRIVXIS

## Ruta

- `/dashboard/chatbot`

## Proposito

Pantalla demo de asistente conversacional con fidelidad visual al diseno de referencia (Figma + capturas), sin integracion con backend de IA real.

## Layout principal

- Workspace de pantalla completa (`100dvh`) dedicado al chatbot.
- Sin header superior del dashboard en esta ruta.
- Sidebar tactico propio del chatbot con estados:
  - Expandido (desktop)
  - Colapsado (desktop)
  - Drawer movil
- Area principal centrada para estado vacio y area scrollable para conversacion activa.

## Estado vacio

- Mensaje central de bienvenida.
- Composer principal con placeholder y controles visuales del asistente.
- Chips de sugerencia inicial.
- El texto central desaparece al primer caracter ingresado.

## Estado de conversacion activa

- Se activa al enviar el primer mensaje.
- Se oculta el estado introductorio completo.
- Los mensajes pasan a un hilo dedicado con scroll independiente.
- El composer queda anclado de forma estable en la zona inferior del hilo.

## Tipeo progresivo (demo IA)

- El mensaje del usuario aparece inmediatamente.
- La respuesta del asistente entra con micro-delay de "thinking".
- Luego se renderiza progresivamente por chunks.
- Se usa cola de respuestas para evitar respuestas duplicadas o solapadas.
- Los timers se limpian correctamente al desmontar para evitar fugas.

## Scroll durante respuesta

- El hilo de mensajes mantiene `overflow-y` propio.
- Si el usuario esta cerca del final, el autoscroll sigue el crecimiento del texto.
- Si el usuario se aleja manualmente del final, se pausa autoscroll hasta volver cerca del bottom.

## Respuestas locales de demo

Archivo:

- `lib/chatbot-demo.ts`

Reglas:

- Consultas sobre `computadora`, `pc`, `rendimiento`, etc. -> respuesta de rendimiento tecnico.
- Consultas sobre `partido`, `jugadores`, `video`, `posesion`, `estadisticas`, etc. -> respuesta estilo analisis DRIVXIS.
- Cualquier otro texto -> fallback profesional de producto.

## Avatar y menu de usuario

- Reusa `UserProfileMenu`.
- En chatbot se usa trigger tipo tarjeta en sidebar.
- El dropdown abre hacia arriba con `dropdownDirection="up"`.
- Se mantiene la misma logica de perfil, accesos y logout.

## Acceso desde header de dashboard

El acceso a `/dashboard/chatbot` se mantiene desde el header compartido en otras paginas del dashboard mediante el shortcut "Chatbot".

## Preparado para integracion futura

La arquitectura de UI mantiene separada la logica de respuestas (`lib/chatbot-demo.ts`) para poder sustituirla por un endpoint real de IA sin rehacer la estructura visual del chat.
