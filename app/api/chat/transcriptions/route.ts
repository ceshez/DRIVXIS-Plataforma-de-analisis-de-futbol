import { gateway, transcribe } from "ai";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getChatErrorCode, getChatErrorMessage } from "@/lib/chatbot";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || !audio.type.startsWith("audio/") || audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "La grabación de voz no es válida o supera 4 MB." }, { status: 400 });
  }

  try {
    const result = await transcribe({
      model: gateway.transcription(process.env.CHAT_TRANSCRIPTION_MODEL_ID || "openai/gpt-4o-mini-transcribe"),
      audio: new Uint8Array(await audio.arrayBuffer()),
      providerOptions: { gateway: { user: user.id, tags: ["feature:chatbot-voice"] } },
      abortSignal: AbortSignal.timeout(55_000),
    });
    return NextResponse.json({ text: result.text, language: result.language || null });
  } catch (error) {
    const code = getChatErrorCode(error);
    return NextResponse.json({ error: getChatErrorMessage(code), code }, { status: 502 });
  }
}
