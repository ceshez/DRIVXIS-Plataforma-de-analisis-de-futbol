import type { AppLocale } from "@/lib/preferences";

const computerKeywords = ["computadora", "computer", "pc", "laptop", "rendimiento", "performance", "procesador", "processor", "ram", "gpu", "fps"];
const footballKeywords = [
  "partido",
  "jugador",
  "jugadores",
  "posesion",
  "video",
  "analisis",
  "equipo",
  "presion",
  "match",
  "player",
  "players",
  "possession",
  "team",
  "pressing",
  "goal",
  "goals",
  "statistics",
  "xg",
  "gol",
  "goles",
  "estadisticas",
  "estadistica",
  "posesion",
  "presion",
];


export function getDemoAssistantResponse(message: string, locale: AppLocale = "es") {
  const normalized = normalizeText(message);
  const english = locale === "en";

  if (containsKeyword(normalized, computerKeywords)) {
    return english
      ? "Great question. For stable video analysis in DRIVXIS, balance CPU, GPU, and RAM: the GPU accelerates frame detection, while the CPU handles decoding, event synchronization, and exports. As a practical baseline, use 16 GB of RAM for standard workloads, 32 GB for long sessions and multitasking, and a dedicated GPU with enough thermal headroom for continuous processing."
      : "Excelente consulta. Para mantener un análisis de video estable en DRIVXIS, prioriza un equilibrio real entre CPU, GPU y RAM: la GPU acelera la detección por frame, pero la CPU gestiona decodificación, sincronía de eventos y exportes; si uno falla, aparece latencia y pérdida de fluidez. Como referencia práctica: 16 GB de RAM para cargas base, 32 GB para jornadas largas y multitarea, y una GPU dedicada con buen margen térmico para sostener sesiones continuas sin throttling.";
  }

  if (containsKeyword(normalized, footballKeywords)) {
    return english
      ? "Perfect. In a typical DRIVXIS scenario, the team controlled the match best between minutes 18 and 34 through aggressive counter-pressing, then lost intensity after minute 60 as the midfield became less compact. Tactical recommendation: adjust the block height in the middle defensive phase, protect inside channels during transitions, and use third-player combinations to sustain useful possession. In the full integration, this summary will use processed video and player/event metrics."
      : "Perfecto. Tomando un escenario tipo DRIVXIS: el equipo mostró mejor control entre 18' y 34' con recuperación alta tras pérdida, luego cayó el ritmo tras el 60' por menor compactación en mediocampo. Recomendación táctica: ajustar altura del bloque en fase defensiva media, proteger carriles interiores en transición y priorizar salidas por tercer hombre para sostener posesión útil. En una integración completa, este resumen se alimentará del video procesado y métricas por jugador/evento.";
  }

  return english
    ? "Understood. This assistant is currently in demo mode, but it already supports a realistic conversational flow and is ready to connect to an analysis API. I can answer as a short report with key findings, tactical impact, and recommended actions for the next match."
    : "Entendido. Este asistente está en modo demo, pero ya opera con flujo conversacional realista y está preparado para conectarse a una API de análisis. Si quieres, te respondo en formato de reporte corto con: hallazgos clave, impacto táctico y acciones recomendadas para el siguiente partido.";
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
