import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteStorageObjects } from "@/lib/storage";
import { serializeChatMessage, serializeChatThread } from "@/lib/chatbot";
import { updateChatThreadSchema } from "@/lib/validators";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ threadId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { threadId } = await context.params;
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, ownerId: user.id },
    include: {
      _count: { select: { messages: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        include: {
          videoLinks: { include: { video: { select: { id: true, originalFilename: true, createdAt: true } } } },
          attachments: { select: { id: true, originalFilename: true, mimeType: true, sizeBytes: true } },
        },
      },
    },
  });
  if (!thread) return NextResponse.json({ error: "Chat no encontrado." }, { status: 404 });

  return NextResponse.json({
    thread: serializeChatThread(thread),
    messages: thread.messages.map(serializeChatMessage),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { threadId } = await context.params;
  const parsed = updateChatThreadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Cambio inválido." }, { status: 400 });
  }

  const result = await prisma.chatThread.updateMany({
    where: { id: threadId, ownerId: user.id },
    data: parsed.data,
  });
  if (result.count !== 1) return NextResponse.json({ error: "Chat no encontrado." }, { status: 404 });

  const thread = await prisma.chatThread.findUniqueOrThrow({
    where: { id: threadId },
    include: { _count: { select: { messages: true } } },
  });
  return NextResponse.json({ thread: serializeChatThread(thread) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { threadId } = await context.params;
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, ownerId: user.id },
    select: { attachments: { select: { objectKey: true, sizeBytes: true } } },
  });
  if (!thread) return NextResponse.json({ error: "Chat no encontrado." }, { status: 404 });

  const releasedBytes = thread.attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0n);
  await prisma.$transaction([
    prisma.chatThread.delete({ where: { id: threadId } }),
    ...(releasedBytes > 0n
      ? [prisma.user.update({ where: { id: user.id }, data: { storageUsedBytes: { decrement: releasedBytes } } })]
      : []),
  ]);
  const storage = await deleteStorageObjects(thread.attachments.map((attachment) => attachment.objectKey));
  return NextResponse.json({ ok: true, warnings: storage.warnings });
}
