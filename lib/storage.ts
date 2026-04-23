import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StorageInput = {
  userId: string;
  filename: string;
  mimeType: string;
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

export async function createPresignedUpload(input: StorageInput) {
  if (!isStorageConfigured()) {
    return {
      configured: false as const,
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
    objectKey,
    uploadUrl: await getSignedUrl(getStorageClient(), command, { expiresIn: 60 * 10 }),
    expiresIn: 60 * 10,
  };
}
