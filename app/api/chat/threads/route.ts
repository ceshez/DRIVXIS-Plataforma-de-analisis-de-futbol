import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeChatThread } from "@/lib/chatbot";
import { createChatThreadSchema } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await requireUser();
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
  const threads = await prisma.chatThread.findMany({
    where: {
      ownerId: user.id,
      ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json({ threads: threads.map(serializeChatThread) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = createChatThreadSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos de chat inválidos." }, { status: 400 });
  }

  const thread = await prisma.chatThread.create({
    data: {
      ownerId: user.id,
      title: parsed.data.title || "Nuevo chat",
      mode: parsed.data.mode || "TACTICAL",
    },
    include: { _count: { select: { messages: true } } },
  });

  return NextResponse.json({ thread: serializeChatThread(thread) }, { status: 201 });
}
