import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createChatAttachmentObjectKey, deleteStorageObject, isStorageConfigured, putStorageObject } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

class AttachmentQuotaError extends Error {}

export async function POST(request: Request) {
  const user = await requireUser();
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const threadId = form?.get("threadId");
  if (!(file instanceof File) || typeof threadId !== "string") {
    return NextResponse.json({ error: "Selecciona un documento válido." }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "Usa PDF, TXT, CSV, Markdown, JSON o una imagen de hasta 4 MB." }, { status: 400 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "El almacenamiento de documentos no está configurado." }, { status: 503 });
  }

  const thread = await prisma.chatThread.findFirst({ where: { id: threadId, ownerId: user.id }, select: { id: true } });
  if (!thread) return NextResponse.json({ error: "Chat no encontrado." }, { status: 404 });

  const objectKey = createChatAttachmentObjectKey({ userId: user.id, filename: file.name, mimeType: file.type });
  await putStorageObject({ objectKey, body: new Uint8Array(await file.arrayBuffer()), contentType: file.type });

  try {
    const attachment = await prisma.$transaction(async (tx) => {
      const quota = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { storageUsedBytes: true, storageLimitBytes: true },
      });
      const sizeBytes = BigInt(file.size);
      if (quota.storageUsedBytes + sizeBytes > quota.storageLimitBytes) throw new AttachmentQuotaError();
      await tx.user.update({ where: { id: user.id }, data: { storageUsedBytes: { increment: sizeBytes } } });
      return tx.chatAttachment.create({
        data: {
          ownerId: user.id,
          threadId,
          objectKey,
          originalFilename: file.name.slice(0, 240),
          mimeType: file.type,
          sizeBytes,
        },
      });
    });
    return NextResponse.json({
      attachment: {
        id: attachment.id,
        name: attachment.originalFilename,
        mimeType: attachment.mimeType,
        sizeBytes: Number(attachment.sizeBytes),
      },
    }, { status: 201 });
  } catch (error) {
    await deleteStorageObject(objectKey).catch(() => undefined);
    if (error instanceof AttachmentQuotaError) {
      return NextResponse.json({ error: "No hay espacio disponible para este documento." }, { status: 403 });
    }
    throw error;
  }
}
