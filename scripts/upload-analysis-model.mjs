import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const root = process.cwd();
loadDotEnv(path.join(root, ".env"));

const force = process.argv.includes("--force");
const modelPath = path.resolve(
  root,
  process.env.ANALYSIS_MODEL_PATH || "analysis/models/best.onnx",
);
const objectKey = (process.env.ANALYSIS_MODEL_OBJECT_KEY || "models/best.onnx").trim();
const bucket = requireEnv("STORAGE_BUCKET");
const endpoint = requireEnv("STORAGE_ENDPOINT");
const region = process.env.STORAGE_REGION || "auto";

const modelStat = await stat(modelPath).catch(() => null);
if (!modelStat?.isFile() || modelStat.size <= 0) {
  throw new Error(`No se encontro un modelo valido en ${modelPath}.`);
}

const sha256 = await hashFile(modelPath);
const client = new S3Client({
  endpoint,
  region,
  forcePathStyle:
    endpoint.includes("r2.cloudflarestorage.com") ||
    endpoint.includes("localhost") ||
    endpoint.includes("127.0.0.1"),
  credentials: {
    accessKeyId: requireEnv("STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("STORAGE_SECRET_ACCESS_KEY"),
  },
});

const existing = await headObject(client, bucket, objectKey);
if (existing) {
  const sameSize = Number(existing.ContentLength) === modelStat.size;
  const sameHash = existing.Metadata?.sha256 === sha256;
  if (sameSize && sameHash) {
    console.log(`El modelo ya esta actualizado en s3://${bucket}/${objectKey}.`);
    process.exit(0);
  }
  if (!force) {
    throw new Error(
      `Ya existe s3://${bucket}/${objectKey} y no coincide con el archivo local. ` +
        "Usa --force solo si deseas reemplazarlo.",
    );
  }
}

console.log(
  `Subiendo ${modelPath} (${modelStat.size} bytes) a s3://${bucket}/${objectKey}...`,
);
await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: createReadStream(modelPath),
    ContentType: "application/octet-stream",
    Metadata: { sha256 },
  }),
);

const uploaded = await headObject(client, bucket, objectKey);
if (!uploaded || Number(uploaded.ContentLength) !== modelStat.size) {
  throw new Error("R2 no confirmo el tamano esperado despues de la subida.");
}

console.log(`Modelo disponible en s3://${bucket}/${objectKey}. sha256=${sha256}`);

async function headObject(storageClient, storageBucket, key) {
  try {
    return await storageClient.send(
      new HeadObjectCommand({ Bucket: storageBucket, Key: key }),
    );
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (error?.name === "NotFound" || error?.name === "NoSuchKey" || status === 404) {
      return null;
    }
    throw error;
  }
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name} en el entorno o en .env.`);
  return value;
}

function loadDotEnv(filePath) {
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch {
    return;
  }

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key] !== undefined) {
      continue;
    }
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}
