import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { ensureLocalObjectDirectory, getLocalObjectPath } from "@/lib/local-storage";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const objectKey = searchParams.get("objectKey") || "";

  if (!objectKey.startsWith(`users/${user.id}/videos/`)) {
    return NextResponse.json({ error: "La llave de storage no pertenece al usuario actual." }, { status: 403 });
  }

  if (!request.headers.get("content-type")?.startsWith("video/")) {
    return NextResponse.json({ error: "El archivo debe ser un video." }, { status: 400 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "No recibimos el archivo de video." }, { status: 400 });
  }

  await ensureLocalObjectDirectory(objectKey);
  const targetPath = getLocalObjectPath(objectKey);
  await pipeline(Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>), createWriteStream(targetPath));

  return NextResponse.json({ ok: true, objectKey, uploadMode: "local" });
}
