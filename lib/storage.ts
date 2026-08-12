import { DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageInput = {
  userId: string;
  filename: string;
  mimeType: string;
};

type UploadMode = "s3" | "local";
type StorageProvider = "local" | "r2" | "s3-compatible";

export type StorageConfigStatus = {
  configured: boolean;
  provider: StorageProvider;
  hasEndpoint: boolean;
  hasBucket: boolean;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  bucketName: string | null;
  endpointHost: string | null;
  region: string;
  errors: string[];
};

export type StorageDebugStatus = {
  configured: boolean;
  endpointHost: string | null;
  bucketName: string | null;
  region: string;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
  warnings: string[];
};

function cleanFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}

export function createVideoObjectKey({ userId, filename }: StorageInput) {
  const date = new Date().toISOString().slice(0, 10);
  const random = crypto.randomUUID();
  return `users/${userId}/videos/${date}/${random}-${cleanFilename(filename) || "match-video"}`;
}

function assertSafeRemoteObjectKey(objectKey: string) {
  if (!objectKey || objectKey.includes("\\") || objectKey.includes("\0") || objectKey.split("/").some((part) => part === ".." || part === "")) {
    throw new Error("Llave de storage invalida.");
  }
}

export function isStorageConfigured() {
  return getStorageConfigStatus().configured;
}

export function createChatAttachmentObjectKey({ userId, filename }: StorageInput) {
  const date = new Date().toISOString().slice(0, 10);
  const random = crypto.randomUUID();
  return `users/${userId}/chat-attachments/${date}/${random}-${cleanFilename(filename) || "documento"}`;
}

function shouldForcePathStyle(endpoint?: string) {
  if (!endpoint) return false;
  return endpoint.includes("localhost") || endpoint.includes("127.0.0.1") || endpoint.includes("r2.cloudflarestorage.com");
}

function getStorageClient() {
  const endpoint = process.env.STORAGE_ENDPOINT || undefined;
  return new S3Client({
    region: process.env.STORAGE_REGION || "auto",
    endpoint,
    forcePathStyle: shouldForcePathStyle(endpoint),
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
    },
  });
}

function normalizeStorageValue(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
}

function getEndpointHost(endpoint: string) {
  try {
    return new URL(endpoint).host || null;
  } catch {
    return null;
  }
}

function isCloudflareR2S3ApiHost(endpointHost: string | null) {
  if (!endpointHost) return false;
  return endpointHost.includes("r2.cloudflarestorage.com");
}

function isCloudflareR2DevHost(endpointHost: string | null) {
  if (!endpointHost) return false;
  return endpointHost.endsWith(".r2.dev");
}

function endpointIncludesBucketName(endpoint: string, bucket: string) {
  if (!endpoint || !bucket) return false;
  const safeBucket = bucket.toLowerCase();
  try {
    const parsed = new URL(endpoint);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, "");
    return host.startsWith(`${safeBucket}.`) || pathname === `/${safeBucket}` || pathname.startsWith(`/${safeBucket}/`);
  } catch {
    return endpoint.toLowerCase().includes(safeBucket);
  }
}

function getStorageProvider(endpointHost: string | null): StorageProvider {
  if (!endpointHost) return "local";
  return endpointHost.includes("r2.cloudflarestorage.com") ? "r2" : "s3-compatible";
}

export function getStorageConfigStatus(): StorageConfigStatus {
  const endpoint = normalizeStorageValue(process.env.STORAGE_ENDPOINT);
  const bucket = normalizeStorageValue(process.env.STORAGE_BUCKET);
  const accessKey = normalizeStorageValue(process.env.STORAGE_ACCESS_KEY_ID);
  const secretKey = normalizeStorageValue(process.env.STORAGE_SECRET_ACCESS_KEY);
  const endpointHost = endpoint ? getEndpointHost(endpoint) : null;
  const errors: string[] = [];

  if (!endpoint) errors.push("Missing STORAGE_ENDPOINT");
  if (!bucket) errors.push("Missing STORAGE_BUCKET");
  if (!accessKey) errors.push("Missing STORAGE_ACCESS_KEY_ID");
  if (!secretKey) errors.push("Missing STORAGE_SECRET_ACCESS_KEY");
  if (isCloudflareR2DevHost(endpointHost)) {
    errors.push("STORAGE_ENDPOINT is using an r2.dev public domain. Use the S3 API endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com");
  }

  const configured = errors.length === 0;
  return {
    configured,
    provider: configured ? getStorageProvider(endpointHost) : "local",
    hasEndpoint: Boolean(endpoint),
    hasBucket: Boolean(bucket),
    hasAccessKey: Boolean(accessKey),
    hasSecretKey: Boolean(secretKey),
    bucketName: bucket || null,
    endpointHost,
    region: normalizeStorageValue(process.env.STORAGE_REGION) || "auto",
    errors,
  };
}

export function getStorageDebugStatus(): StorageDebugStatus {
  const status = getStorageConfigStatus();
  const endpoint = normalizeStorageValue(process.env.STORAGE_ENDPOINT);
  const bucketName = status.bucketName || "";
  const endpointHost = status.endpointHost;
  const warnings: string[] = [];

  if (!status.hasBucket) {
    warnings.push("Bucket missing.");
  }
  if (endpoint && !endpoint.startsWith("https://")) {
    warnings.push("Endpoint should start with https://");
  }
  if (bucketName && endpointIncludesBucketName(endpoint, bucketName)) {
    warnings.push("Endpoint appears to include bucket name. Keep bucket only in STORAGE_BUCKET.");
  }
  if (isCloudflareR2DevHost(endpointHost)) {
    warnings.push("Endpoint points to an r2.dev public domain. Presigned PUT uploads require the S3 API endpoint.");
  }
  if (endpointHost && !endpointHost.includes("r2.cloudflarestorage.com")) {
    warnings.push("Endpoint does not look like Cloudflare R2.");
  }
  if (endpointHost && endpointHost.includes("cloudflare") && !isCloudflareR2S3ApiHost(endpointHost)) {
    warnings.push("Cloudflare endpoint is not the R2 S3 API domain. Presigned PUT URLs will fail on custom/public domains.");
  }
  if (status.region !== "auto") {
    warnings.push('Region should usually be "auto" for Cloudflare R2.');
  }
  if (!status.hasAccessKey) {
    warnings.push("Access key missing.");
  }
  if (!status.hasSecretKey) {
    warnings.push("Secret key missing.");
  }

  return {
    configured: status.configured,
    endpointHost: status.endpointHost,
    bucketName: status.bucketName,
    region: status.region,
    hasAccessKey: status.hasAccessKey,
    hasSecretKey: status.hasSecretKey,
    warnings,
  };
}

export async function checkStorageConnectivity() {
  const status = getStorageConfigStatus();
  if (!status.configured) {
    return {
      ok: false as const,
      message: "Storage not configured.",
      errorName: "StorageNotConfigured",
      errorCode: "STORAGE_NOT_CONFIGURED",
    };
  }

  try {
    await getStorageClient().send(
      new HeadBucketCommand({
        Bucket: process.env.STORAGE_BUCKET,
      }),
    );
    return { ok: true as const, message: "Storage connectivity check succeeded." };
  } catch (error) {
    const storageError = error as {
      name?: string;
      code?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    const rawMessage =
      error instanceof Error && error.message
        ? error.message
        : "No se pudo validar conexion con storage remoto.";
    const details = rawMessage.replace(/\s+/g, " ").trim().slice(0, 280);
    return {
      ok: false as const,
      message: "Storage connectivity check failed.",
      errorName: storageError?.name || "StorageError",
      errorCode: storageError?.code || storageError?.Code || null,
      httpStatusCode: storageError?.$metadata?.httpStatusCode || null,
      details,
    };
  }
}

export async function getStorageObject(objectKey: string, range?: string | null) {
  assertSafeRemoteObjectKey(objectKey);
  if (!isStorageConfigured()) {
    throw new Error("Storage S3 no está configurado.");
  }

  return getStorageClient().send(
    new GetObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: objectKey,
      Range: range || undefined,
    }),
  );
}

export async function putStorageObject({
  objectKey,
  body,
  contentType,
}: {
  objectKey: string;
  body: PutObjectCommandInput["Body"];
  contentType: string;
}) {
  assertSafeRemoteObjectKey(objectKey);
  if (!isStorageConfigured()) {
    throw new Error("Storage S3 no está configurado.");
  }

  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );

  return { objectKey };
}

export async function deleteStorageObject(objectKey: string) {
  assertSafeRemoteObjectKey(objectKey);
  if (!isStorageConfigured()) {
    return { ok: false as const, code: "STORAGE_NOT_CONFIGURED" as const, objectKey };
  }

  try {
    await getStorageClient().send(
      new DeleteObjectCommand({
        Bucket: process.env.STORAGE_BUCKET,
        Key: objectKey,
      }),
    );
    return { ok: true as const, objectKey };
  } catch (error) {
    const storageError = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    const status = storageError?.$metadata?.httpStatusCode || 0;
    const name = storageError?.name || "";
    if (name === "NoSuchKey" || status === 404) {
      return { ok: false as const, code: "NOT_FOUND" as const, objectKey };
    }
    const message = error instanceof Error ? error.message : "Error al eliminar objeto remoto.";
    return { ok: false as const, code: "DELETE_FAILED" as const, objectKey, message: message.slice(0, 300) };
  }
}

export async function deleteStorageObjects(objectKeys: string[]) {
  const uniqueKeys = Array.from(new Set(objectKeys.filter(Boolean)));
  if (!isStorageConfigured()) {
    return {
      deleted: [] as string[],
      warnings: uniqueKeys.map((objectKey) => ({ objectKey, code: "STORAGE_NOT_CONFIGURED" as const })),
      skipped: true as const,
    };
  }

  const deleted: string[] = [];
  const warnings: Array<{ objectKey: string; code: "INVALID_KEY" | "NOT_FOUND" | "DELETE_FAILED" | "STORAGE_NOT_CONFIGURED"; message?: string }> = [];

  const deletionResults = await Promise.all(
    uniqueKeys.map(async (objectKey) => {
      try {
        const result = await deleteStorageObject(objectKey);
        return { objectKey, result } as const;
      } catch (error) {
        return { objectKey, error } as const;
      }
    }),
  );

  for (const entry of deletionResults) {
    if ("error" in entry) {
      warnings.push({
        objectKey: entry.objectKey,
        code: "INVALID_KEY",
        message: entry.error instanceof Error ? entry.error.message.slice(0, 300) : "Llave invalida para borrar en storage remoto.",
      });
      continue;
    }

    if (entry.result.ok) {
      deleted.push(entry.objectKey);
      continue;
    }

    warnings.push({
      objectKey: entry.objectKey,
      code: entry.result.code,
      ...(entry.result && "message" in entry.result && entry.result.message ? { message: entry.result.message } : {}),
    });
  }

  return {
    deleted,
    warnings,
    skipped: false as const,
  };
}

export async function createPresignedUpload(input: StorageInput) {
  const status = getStorageConfigStatus();
  if (!status.configured) {
    return {
      configured: false as const,
      uploadMode: "local" as const satisfies UploadMode,
      objectKey: createVideoObjectKey(input),
      uploadUrl: null,
      expiresIn: 0,
      configErrors: status.errors,
      provider: status.provider,
    };
  }

  const objectKey = createVideoObjectKey(input);
  const command = new PutObjectCommand({
    Bucket: process.env.STORAGE_BUCKET,
    Key: objectKey,
    ContentType: input.mimeType,
  });

  return {
    configured: true as const,
    uploadMode: "s3" as const satisfies UploadMode,
    objectKey,
    signedContentType: input.mimeType,
    uploadUrl: await getSignedUrl(getStorageClient(), command, { expiresIn: 60 * 10 }),
    expiresIn: 60 * 10,
    provider: status.provider,
    configErrors: [] as string[],
  };
}

