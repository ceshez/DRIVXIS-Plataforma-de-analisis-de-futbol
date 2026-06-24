import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { NextResponse } from "next/server";
import { ensureLocalObjectDirectory, getLocalObjectPath } from "@/lib/local-storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildStorageUsagePayload } from "@/lib/storage-usage";

export const runtime = "nodejs";

const MAX_LOCAL_UPLOAD_BYTES = 12n * 1024n * 1024n * 1024n;

class LocalUploadTooLargeError extends Error {
  constructor(public readonly limitBytes: bigint) {
    super("Local upload exceeded the allowed size.");
  }
}

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

  const quota = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      storageUsedBytes: true,
      storageLimitBytes: true,
    },
  });
  if (!quota) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  const remainingBytes = quota.storageLimitBytes - quota.storageUsedBytes;
  const allowedBytes = minBigInt(MAX_LOCAL_UPLOAD_BYTES, remainingBytes > 0n ? remainingBytes : 0n);
  const contentLength = parseContentLength(request.headers.get("content-length"));

  if (allowedBytes <= 0n || (contentLength !== null && contentLength > allowedBytes)) {
    return NextResponse.json(
      {
        error: "Storage limit exceeded.",
        storage: buildStorageUsagePayload(quota.storageUsedBytes, quota.storageLimitBytes),
      },
      { status: 413 },
    );
  }

  await ensureLocalObjectDirectory(objectKey);
  const targetPath = getLocalObjectPath(objectKey);

  try {
    await pipeline(
      Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>),
      createByteLimitTransform(allowedBytes),
      createWriteStream(targetPath),
    );
  } catch (error) {
    await rm(targetPath, { force: true }).catch(() => undefined);

    if (error instanceof LocalUploadTooLargeError) {
      return NextResponse.json(
        {
          error: "Storage limit exceeded.",
          storage: buildStorageUsagePayload(quota.storageUsedBytes, quota.storageLimitBytes),
        },
        { status: 413 },
      );
    }

    throw error;
  }

  return NextResponse.json({ ok: true, objectKey, uploadMode: "local" });
}

function parseContentLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  return BigInt(value);
}

function minBigInt(left: bigint, right: bigint) {
  return left < right ? left : right;
}

function createByteLimitTransform(limitBytes: bigint) {
  let receivedBytes = 0n;

  return new Transform({
    transform(chunk: Buffer | Uint8Array, _encoding, callback) {
      receivedBytes += BigInt(chunk.byteLength);

      if (receivedBytes > limitBytes) {
        callback(new LocalUploadTooLargeError(limitBytes));
        return;
      }

      callback(null, chunk);
    },
  });
}
