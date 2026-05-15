const computerKeywords = ["computadora", "pc", "laptop", "rendimiento", "procesador", "ram", "gpu", "fps"];
const footballKeywords = [
  "partido",
  "jugador",
  "jugadores",
  "posesion",
  "video",
  "analisis",
  "equipo",
  "presion",
  "xg",
  "gol",
  "goles",
  "estadisticas",
  "estadistica",
  "posesion",
  "presion",
];

export const chatbotStarterPrompts = [
  "Análisis táctico",
  "Rendimiento físico",
  "Presión y posesión",
  "Comparar equipos",
  "Plan de juego",
  "Resumen del partido",
];

export function getDemoAssistantResponse(message: string) {
  const normalized = normalizeText(message);

  if (containsKeyword(normalized, computerKeywords)) {
    return "Excelente consulta. Para mantener un análisis de video estable en DRIVXIS, prioriza un equilibrio real entre CPU, GPU y RAM: la GPU acelera la detección por frame, pero la CPU gestiona decodificación, sincronía de eventos y exportes; si uno falla, aparece latencia y pérdida de fluidez. Como referencia práctica: 16 GB de RAM para cargas base, 32 GB para jornadas largas y multitarea, y una GPU dedicada con buen margen térmico para sostener sesiones continuas sin throttling.";
  }

  if (containsKeyword(normalized, footballKeywords)) {
    return "Perfecto. Tomando un escenario tipo DRIVXIS: el equipo mostró mejor control entre 18' y 34' con recuperación alta tras pérdida, luego cayó el ritmo tras el 60' por menor compactación en mediocampo. Recomendación táctica: ajustar altura del bloque en fase defensiva media, proteger carriles interiores en transición y priorizar salidas por tercer hombre para sostener posesión útil. En una integración completa, este resumen se alimentará del video procesado y métricas por jugador/evento.";
  }

  return "Entendido. Este asistente está en modo demo, pero ya opera con flujo conversacional realista y está preparado para conectarse a una API de análisis. Si quieres, te respondo en formato de reporte corto con: hallazgos clave, impacto táctico y acciones recomendadas para el siguiente partido.";
}

function containsKeyword(text: string, words: string[]) {
  return words.some((word) => text.includes(normalizeText(word)));
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
