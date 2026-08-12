import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteStorageObject } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const user = await requireUser();
  const { attachmentId } = await context.params;
  const attachment = await prisma.chatAttachment.findFirst({
    where: { id: attachmentId, ownerId: user.id, messageId: null },
    select: { id: true, objectKey: true, sizeBytes: true },
  });
  if (!attachment) return NextResponse.json({ error: "Documento no encontrado o ya enviado." }, { status: 404 });

  await prisma.$transaction([
    prisma.chatAttachment.delete({ where: { id: attachment.id } }),
    prisma.user.update({ where: { id: user.id }, data: { storageUsedBytes: { decrement: attachment.sizeBytes } } }),
  ]);
  const storage = await deleteStorageObject(attachment.objectKey);
  return NextResponse.json({ ok: true, storage });
}
