import { NextResponse } from "next/server";
import { createPresignedUpload } from "@/lib/storage";
import { requireUser } from "@/lib/session";
import { presignVideoSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = presignVideoSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Archivo de video invalido." },
      { status: 400 },
    );
  }

  const presign = await createPresignedUpload({
    userId: user.id,
    filename: parsed.data.filename,
    mimeType: parsed.data.mimeType,
  });

  return NextResponse.json(presign);
}
