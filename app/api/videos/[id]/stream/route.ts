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
  let remoteError: { code: string; message: string } | null = null;

  if (remoteObjectKey) {
    if (isStorageConfigured()) {
      try {
        return await streamRemoteObject(remoteObjectKey, contentType, range);
      } catch (error) {
        remoteError = describeRemoteError(error);
      }
    } else {
      remoteError = {
        code: "STORAGE_NOT_CONFIGURED",
        message: "Storage remoto no configurado.",
      };
    }
  }

  const processedPath =
    typeof metadata.processedLocalPath === "string"
      ? metadata.processedLocalPath
      : typeof metadata.annotatedLocalPath === "string"
        ? metadata.annotatedLocalPath
        : "";
  const resolvedSourcePath = resolveSourceLocalPath(metadata, video.objectKey);
  const filePath =
    variant === "source"
      ? resolvedSourcePath
      : processedPath;

  if (!filePath) {
    return getMissingFileResponse({
      variant,
      remoteObjectKey,
      remoteError,
    });
  }

  try {
    return await streamLocalFile(filePath, contentType, range);
  } catch {
    if (variant === "source") {
      if (remoteError) {
        return streamErrorResponse(404, "SOURCE_VIDEO_MISSING", "No encontramos el video fuente en storage remoto ni local.", {
          remoteError: remoteError.message,
        });
      }
      return streamErrorResponse(404, "SOURCE_VIDEO_MISSING_LOCAL", "No encontramos el video fuente local.");
    }

    if (remoteError) {
      return streamErrorResponse(
        404,
        "PROCESSED_VIDEO_MISSING",
        "El video procesado no esta disponible en Cloudflare R2/storage remoto ni local.",
        { remoteError: remoteError.message },
      );
    }
    return streamErrorResponse(404, "PROCESSED_VIDEO_MISSING_LOCAL", "El video procesado no existe en almacenamiento local.");
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

function streamErrorResponse(status: number, code: string, error: string, details?: Record<string, string>) {
  return NextResponse.json(
    {
      error,
      code,
      ...(details ? { details } : {}),
    },
    { status },
  );
}

function describeRemoteError(error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudo leer el objeto remoto.";
  const storageError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  const status = storageError?.$metadata?.httpStatusCode || 0;
  const name = storageError?.name || "";

  if (message.includes("Storage S3 no est")) {
    return { code: "STORAGE_NOT_CONFIGURED", message: "Storage remoto no configurado." };
  }
  if (name === "NoSuchKey" || status === 404) {
    return { code: "REMOTE_OBJECT_NOT_FOUND", message: "Objeto remoto no encontrado en Cloudflare R2/storage." };
  }
  if (name === "AccessDenied" || status === 401 || status === 403) {
    return { code: "REMOTE_ACCESS_DENIED", message: "Storage remoto rechazo el acceso (401/403)." };
  }

  return { code: "REMOTE_STREAM_FAILED", message: message.slice(0, 260) };
}

function getMissingFileResponse({
  variant,
  remoteObjectKey,
  remoteError,
}: {
  variant: "source" | "processed";
  remoteObjectKey: string;
  remoteError: { code: string; message: string } | null;
}) {
  if (variant === "source") {
    if (remoteObjectKey && remoteError) {
      return streamErrorResponse(404, "SOURCE_VIDEO_MISSING", "No encontramos el video fuente en Cloudflare R2/storage remoto ni local.", {
        remoteError: remoteError.message,
      });
    }
    return streamErrorResponse(404, "SOURCE_VIDEO_MISSING_LOCAL", "No encontramos el video fuente local.");
  }

  if (!remoteObjectKey) {
    return streamErrorResponse(404, "PROCESSED_VIDEO_LOCATION_NOT_FOUND", "Processed video location not found.");
  }
  if (remoteError?.code === "STORAGE_NOT_CONFIGURED") {
    return streamErrorResponse(
      404,
      "PROCESSED_STORAGE_NOT_CONFIGURED",
      "Storage remoto no esta configurado y no hay copia local del video procesado.",
    );
  }
  if (remoteError?.code === "REMOTE_OBJECT_NOT_FOUND") {
    return streamErrorResponse(404, "PROCESSED_REMOTE_OBJECT_NOT_FOUND", "El video procesado no fue encontrado en Cloudflare R2/storage remoto.");
  }
  if (remoteError) {
    return streamErrorResponse(502, "PROCESSED_REMOTE_STREAM_FAILED", "No se pudo leer el video procesado desde storage remoto.", {
      remoteError: remoteError.message,
    });
  }
  return streamErrorResponse(404, "PROCESSED_VIDEO_MISSING_LOCAL", "El video procesado no existe en almacenamiento local.");
}

function resolveSourceLocalPath(metadata: Record<string, unknown>, objectKey: string) {
  if (typeof metadata.sourceLocalPath === "string") return metadata.sourceLocalPath;
  try {
    return getLocalObjectPath(objectKey);
  } catch {
    return "";
  }
}
