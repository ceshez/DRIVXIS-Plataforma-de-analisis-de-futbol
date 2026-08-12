# Chatbot de producción - Dashboard DRIVXIS

## Rutas de interfaz

- `/dashboard/chatbot`: nuevo chat.
- `/dashboard/chatbot/:threadId`: conversación persistida.

## Proveedor de IA

El chatbot usa Vercel AI SDK y Vercel AI Gateway. No tiene respuestas locales ni un modo de demostración.

- Chat: `CHAT_MODEL_ID`, por defecto `openai/gpt-5.4-mini`, verificado con los créditos gratuitos actuales. Usa `openai/gpt-5.4-nano` como fallback.
- Voz: `CHAT_TRANSCRIPTION_MODEL_ID`, por defecto `openai/gpt-4o-mini-transcribe`.
- En Vercel la autenticación se resuelve mediante `VERCEL_OIDC_TOKEN` administrado por la plataforma.
- Fuera de Vercel se puede usar `AI_GATEWAY_API_KEY` o ejecutar `vercel env pull` después de vincular el proyecto.

Nunca se debe exponer una clave en variables `NEXT_PUBLIC_*` ni enviarla desde el navegador.

## Datos reales y límites

Antes de llamar al modelo, el servidor consulta únicamente videos del usuario autenticado y crea un contexto estructurado a partir del último `MetricSnapshot` compatible.

- Los promedios de posesión, el mejor partido y el peor partido se calculan en el servidor.
- Si la consulta dice "últimos N partidos", se seleccionan hasta 12 partidos por `playedAt` y, en ausencia de esa fecha, por `createdAt`.
- Una referencia `@video` limita el contexto a los videos seleccionados.
- La IA no recibe ni afirma haber visto el metraje original; recibe métricas y, cuando aplica, documentos.
- La velocidad solo se publica cuando `speed.publishable` es verdadero.
- El pipeline actual no publica una métrica validada de presión. El asistente debe señalar esa ausencia y no inventar valores.
- Cuando la asociación entre club y color detectado no está confirmada, la respuesta debe advertirlo.

## Funciones de interfaz

- Historial de chats recientes, apertura individual, búsqueda, cambio de nombre y eliminación.
- Modos General, Táctico y Físico persistidos por chat.
- Comandos `/analisis-tactico`, `/rendimiento-fisico`, `/presion-posesion`, `/comparar-equipos`, `/plan-de-juego` y `/resumen-partido`.
- Autocompletado `@` con videos propios y estado de métricas.
- Carga desde `+` de PDF, TXT, CSV, Markdown, JSON, PNG, JPEG o WebP de hasta 4 MB mediante el storage configurado.
- Dictado mediante grabación del navegador y transcripción remota.
- Respuesta NDJSON transmitida progresivamente y persistida al terminar.

## Seguridad y costos

- Todos los endpoints requieren la cookie de sesión actual y verifican propiedad de threads, videos y documentos.
- AI Gateway recibe el `userId` para atribución y límites por usuario, además de tags por función y modo.
- Se solicita a Gateway excluir rutas que entrenen con prompts (`disallowPromptTraining`).
- Configurar presupuesto y límites por usuario en Vercel antes de producción.

## Despliegue

1. Aplicar `npm run prisma:deploy` contra la base de producción.
2. Activar AI Gateway en el proyecto de Vercel.
3. Confirmar que el storage R2/S3 ya configurado admite documentos.
4. Opcionalmente sobrescribir los IDs de modelo en variables de entorno.
5. Ejecutar un chat de prueba con un partido analizado y revisar uso/logs en AI Gateway.
