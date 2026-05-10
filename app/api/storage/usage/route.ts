import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildStorageUsagePayload } from "@/lib/storage-usage";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
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

  return NextResponse.json(buildStorageUsagePayload(dbUser.storageUsedBytes, dbUser.storageLimitBytes));
}
