import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { isRecord } from "@/lib/analysis-metrics";
import { getLocalObjectPath } from "@/lib/local-storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getStorageObject, isStorageConfigured } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const requestedVariant = searchParams.get("variant");
  const variant = requestedVariant === "source" ? "source" : "processed";

  const video = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      objectKey: true,
      mimeType: true,
      metadata: true,
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  const metadata = isRecord(video.metadata) ? video.metadata : {};
  const processedObjectKey =
    typeof metadata.processedObjectKey === "string"
      ? metadata.processedObjectKey
      : typeof metadata.annotatedObjectKey === "string"
        ? metadata.annotatedObjectKey
        : "";
  const sourceObjectKey = video.objectKey;

  const remoteObjectKey = variant === "source" ? sourceObjectKey : processedObjectKey;
  const contentType = variant === "source" ? video.mimeType : "video/mp4";
  const range = request.headers.get("range");

  if (remoteObjectKey && isStorageConfigured()) {
    try {
      return await streamRemoteObject(remoteObjectKey, contentType, range);
    } catch {
      if (variant === "processed") {
        return NextResponse.json({ error: "El video procesado todavía no está disponible en storage." }, { status: 404 });
      }
      // If source storage fails, continue with local fallback below.
    }
  }

  const processedPath =
    typeof metadata.processedLocalPath === "string"
      ? metadata.processedLocalPath
      : typeof metadata.annotatedLocalPath === "string"
        ? metadata.annotatedLocalPath
        : "";
  const filePath =
    variant === "source"
      ? typeof metadata.sourceLocalPath === "string"
        ? metadata.sourceLocalPath
        : getLocalObjectPath(video.objectKey)
      : processedPath;

  if (!filePath) {
    return NextResponse.json({ error: "El video procesado todavía no está disponible." }, { status: 404 });
  }

  try {
    return await streamLocalFile(filePath, contentType, range);
  } catch {
    return NextResponse.json({ error: "No encontramos el archivo local del video." }, { status: 404 });
  }
}

async function streamRemoteObject(objectKey: string, contentType: string, range: string | null) {
  const object = await getStorageObject(objectKey, range);
  if (!object.Body) {
    return NextResponse.json({ error: "El archivo remoto no tiene contenido." }, { status: 404 });
  }

  const headers: Record<string, string> = {
    "accept-ranges": "bytes",
    "content-type": object.ContentType || contentType,
  };

  if (object.ContentLength !== undefined) {
    headers["content-length"] = String(object.ContentLength);
  }

  if (object.ContentRange) {
    headers["content-range"] = object.ContentRange;
  }

  const status = object.ContentRange ? 206 : 200;
  return new Response(Readable.toWeb(object.Body as NodeJS.ReadableStream) as BodyInit, {
    status,
    headers,
  });
}

async function streamLocalFile(filePath: string, contentType: string, range: string | null) {
  const fileStat = await stat(filePath);

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      return new Response(null, { status: 416 });
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : fileStat.size - 1;
    if (start >= fileStat.size || end >= fileStat.size || start > end) {
      return new Response(null, {
        status: 416,
        headers: { "content-range": `bytes */${fileStat.size}` },
      });
    }

    return new Response(Readable.toWeb(createReadStream(filePath, { start, end })) as BodyInit, {
      status: 206,
      headers: {
        "accept-ranges": "bytes",
        "content-length": String(end - start + 1),
        "content-range": `bytes ${start}-${end}/${fileStat.size}`,
        "content-type": contentType,
      },
    });
  }

  return new Response(Readable.toWeb(createReadStream(filePath)) as BodyInit, {
    headers: {
      "accept-ranges": "bytes",
      "content-length": String(fileStat.size),
      "content-type": contentType,
    },
  });
}
