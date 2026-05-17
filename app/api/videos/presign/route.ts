import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildStorageUsagePayload } from "@/lib/storage-usage";
import { createPresignedUpload } from "@/lib/storage";
import { requireUser } from "@/lib/session";
import { presignVideoSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = presignVideoSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Archivo de video inválido." },
      { status: 400 },
    );
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      storageUsedBytes: true,
      storageLimitBytes: true,
    },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const requestedSizeBytes = BigInt(parsed.data.sizeBytes);
  const projectedUsage = dbUser.storageUsedBytes + requestedSizeBytes;
  if (projectedUsage > dbUser.storageLimitBytes) {
    return NextResponse.json(
      {
        error: "Storage limit exceeded.",
        storage: buildStorageUsagePayload(dbUser.storageUsedBytes, dbUser.storageLimitBytes),
      },
      { status: 403 },
    );
  }

  try {
    const presign = await createPresignedUpload({
      userId: user.id,
      filename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
    });
    if (process.env.NODE_ENV === "development") {
      const uploadUrlHost = getUploadUrlHost(presign.uploadUrl);
      console.info("[DRIVXIS presign diagnostics]", {
        userId: user.id,
        requestedMimeType: parsed.data.mimeType,
        signedContentType: presign.signedContentType || null,
        uploadMode: presign.uploadMode,
        provider: presign.provider,
        uploadUrlHost,
      });
    }
    return NextResponse.json(presign);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo preparar la carga en storage remoto.";
    return NextResponse.json(
      {
        error: "No se pudo preparar la URL de carga para Cloudflare R2/S3.",
        details: message.slice(0, 400),
      },
      { status: 500 },
    );
  }
}

function getUploadUrlHost(uploadUrl?: string | null) {
  if (!uploadUrl) return null;
  try {
    return new URL(uploadUrl).host;
  } catch {
    return null;
  }
}
