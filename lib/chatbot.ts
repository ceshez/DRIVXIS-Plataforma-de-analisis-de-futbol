import type { ChatMode } from "@prisma/client";

export const CHAT_COMMANDS = [
  { id: "TACTICAL_ANALYSIS", slash: "/analisis-tactico", label: "Análisis táctico", mode: "TACTICAL" },
  { id: "PHYSICAL_PERFORMANCE", slash: "/rendimiento-fisico", label: "Rendimiento físico", mode: "PHYSICAL" },
  { id: "PRESSURE_POSSESSION", slash: "/presion-posesion", label: "Presión y posesión", mode: "TACTICAL" },
  { id: "COMPARE_TEAMS", slash: "/comparar-equipos", label: "Comparar equipos", mode: "TACTICAL" },
  { id: "GAME_PLAN", slash: "/plan-de-juego", label: "Plan de juego", mode: "TACTICAL" },
  { id: "MATCH_SUMMARY", slash: "/resumen-partido", label: "Resumen del partido", mode: "GENERAL" },
] as const;

export type ChatCommandId = (typeof CHAT_COMMANDS)[number]["id"];

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  GENERAL: "Asistente general",
  TACTICAL: "Asistente táctico",
  PHYSICAL: "Asistente físico",
};

export function createChatTitle(content: string) {
  const normalized = content
    .replace(/^\/[\w-]+\s*/u, "")
    .replace(/@\[[^\]]+\]\([^\)]+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Nuevo análisis";
  return normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}…` : normalized;
}

export function getRequestedRecentMatchCount(content: string, fallback = 3) {
  const normalized = content.toLocaleLowerCase("es");
  const digitMatch = normalized.match(/(?:últim(?:os|as)|ultim(?:os|as)|recent(?:es)?)\s+(\d{1,2})/u);
  if (digitMatch) return Math.min(12, Math.max(1, Number(digitMatch[1])));

  const words: Record<string, number> = {
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
  };
  const wordMatch = normalized.match(/(?:últim(?:os|as)|ultim(?:os|as)|recent(?:es)?)\s+([a-záéíóú]+)/u);
  return (wordMatch?.[1] && words[wordMatch[1]]) || fallback;
}

export function serializeChatThread(thread: {
  id: string;
  title: string;
  mode: ChatMode;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  _count?: { messages: number };
}) {
  return {
    id: thread.id,
    title: thread.title,
    mode: thread.mode,
    lastMessageAt: thread.lastMessageAt.toISOString(),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    messageCount: thread._count?.messages ?? 0,
  };
}

export function serializeChatMessage(message: {
  id: string;
  role: "USER" | "ASSISTANT";
  status: "PENDING" | "STREAMING" | "COMPLETED" | "FAILED";
  mode: ChatMode;
  content: string;
  command: string | null;
  errorCode: string | null;
  createdAt: Date;
  videoLinks?: Array<{ video: { id: string; originalFilename: string; createdAt: Date } }>;
  attachments?: Array<{ id: string; originalFilename: string; mimeType: string; sizeBytes: bigint }>;
}) {
  return {
    id: message.id,
    role: message.role.toLowerCase() as "user" | "assistant",
    status: message.status,
    mode: message.mode,
    content: message.content,
    command: message.command,
    errorCode: message.errorCode,
    createdAt: message.createdAt.toISOString(),
    videos: (message.videoLinks ?? []).map(({ video }) => ({
      id: video.id,
      label: video.originalFilename,
      createdAt: video.createdAt.toISOString(),
    })),
    attachments: (message.attachments ?? []).map((attachment) => ({
      id: attachment.id,
      name: attachment.originalFilename,
      mimeType: attachment.mimeType,
      sizeBytes: Number(attachment.sizeBytes),
    })),
  };
}

export function getChatErrorCode(error: unknown) {
  const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
  const message = error instanceof Error ? error.message.toLocaleLowerCase("en") : "";
  if (statusCode === 401 || statusCode === 403) return "AI_NOT_CONFIGURED";
  if (statusCode === 402) return "AI_BUDGET_EXCEEDED";
  if (statusCode === 429 || message.includes("rate-limit") || message.includes("rate limited")) return "AI_RATE_LIMITED";
  if (statusCode >= 500) return "AI_UNAVAILABLE";
  return "AI_GENERATION_FAILED";
}

export function getChatErrorMessage(code: string) {
  if (code === "AI_NOT_CONFIGURED") return "La IA todavía no está habilitada para este despliegue de Vercel.";
  if (code === "AI_BUDGET_EXCEEDED") return "El presupuesto mensual de IA se agotó. Inténtalo cuando se renueve o amplíalo en Vercel.";
  if (code === "AI_RATE_LIMITED") return "Se alcanzó el límite temporal de consultas. Espera un momento y vuelve a intentarlo.";
  return "No se pudo completar la respuesta de IA. Vuelve a intentarlo.";
}
