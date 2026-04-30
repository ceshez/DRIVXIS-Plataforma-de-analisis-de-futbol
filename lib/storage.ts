import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageInput = {
  userId: string;
  filename: string;
  mimeType: string;
};

export type UploadMode = "s3" | "local";

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
  return Boolean(
    process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY
  );
}

function getStorageClient() {
  return new S3Client({
    region: process.env.STORAGE_REGION || "auto",
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.STORAGE_ENDPOINT?.includes("localhost")),
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
    },
  });
}

export function getConfiguredStorageClient() {
  return getStorageClient();
}

export async function getStorageObject(objectKey: string) {
  assertSafeRemoteObjectKey(objectKey);
  if (!isStorageConfigured()) {
    throw new Error("Storage S3 no esta configurado.");
  }

  return getStorageClient().send(
    new GetObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: objectKey,
    }),
  );
}

export async function createPresignedUpload(input: StorageInput) {
  if (!isStorageConfigured()) {
    return {
      configured: false as const,
      uploadMode: "local" as const satisfies UploadMode,
      objectKey: createVideoObjectKey(input),
      uploadUrl: null,
      expiresIn: 0,
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
    uploadUrl: await getSignedUrl(getStorageClient(), command, { expiresIn: 60 * 10 }),
    expiresIn: 60 * 10,
  };
}
