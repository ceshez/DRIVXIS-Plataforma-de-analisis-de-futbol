import { createReadStream, createWriteStream } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const root = process.cwd();
loadDotEnv(path.join(root, ".env"));

const { PrismaClient } = await import("@prisma/client");
const { GetObjectCommand, PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");

const connectionString =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/drivxis?schema=public";
const shouldUsePgAdapter =
  connectionString.startsWith("postgresql://") || connectionString.startsWith("postgres://");

let adapterOptions = {};
if (shouldUsePgAdapter) {
  const { PrismaPg } = await import("@prisma/adapter-pg");
  adapterOptions = { adapter: new PrismaPg({ connectionString }) };
} else {
  adapterOptions = { accelerateUrl: connectionString };
}

const prisma = new PrismaClient(adapterOptions);

const args = new Set(process.argv.slice(2));
const once = args.has("--once");
const intervalMs = Number(process.env.ANALYSIS_WORKER_INTERVAL_MS || 5000);
const pythonBin = process.env.PYTHON_BIN || "python";
const modelPath = path.resolve(root, process.env.ANALYSIS_MODEL_PATH || "analysis/models/best.pt");
const localStorageRoot = path.resolve(root, process.env.LOCAL_STORAGE_ROOT || ".drivxis/uploads");
const analysisRoot = path.resolve(root, process.env.ANALYSIS_STORAGE_ROOT || ".drivxis/analysis");
const progressWriteState = new Map();
const analysisUploadMaxAttempts = clampEnvInteger(process.env.ANALYSIS_UPLOAD_MAX_ATTEMPTS, 4, { min: 1, max: 8 });
const analysisUploadBaseDelayMs = clampEnvInteger(process.env.ANALYSIS_UPLOAD_BASE_DELAY_MS, 800, { min: 100, max: 15000 });
const analysisUploadMaxDelayMs = clampEnvInteger(process.env.ANALYSIS_UPLOAD_MAX_DELAY_MS, 6000, { min: 500, max: 30000 });

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

try {
  await runWorker();
} finally {
  await prisma.$disconnect();
}

async function runWorker() {
  log(`DRIVXIS analysis worker online. once=${once}`);
  log(`pythonBin=${pythonBin}`);
  log(`modelPath=${modelPath}`);
  log(`localStorageRoot=${localStorageRoot}`);
  log(`analysisRoot=${analysisRoot}`);
  while (true) {
    const job = await claimNextJob();
    if (!job) {
      if (once) return;
      await wait(intervalMs);
      continue;
    }

    await processJob(job).catch((error) => failJob(job, error));
    if (once) return;
  }
}

async function claimNextJob() {
  const job = await prisma.analysisJob.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    include: { video: true },
  });
  if (!job) return null;
  if (!job.video) {
    await markJobFailedIfRunning(job.id, "Video was deleted before the analysis could start.");
    return null;
  }

  const claimed = await prisma.analysisJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING", progress: 5, error: null, startedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  log(`Job ${job.id} for video ${job.videoId}: QUEUED -> RUNNING`);
  const markedVideo = await prisma.video.updateMany({
    where: { id: job.videoId },
    data: { status: "PROCESSING" },
  });
  if (markedVideo.count !== 1) {
    await markJobFailedIfRunning(job.id, "Video was deleted before analysis started.");
    log(`Job ${job.id}: video ${job.videoId} no longer exists after claim.`);
    return null;
  }

  return { ...job, status: "RUNNING" };
}

async function processJob(job) {
  if (!job.video) {
    await markJobFailedIfRunning(job.id, "Video no longer exists.");
    return;
  }
  const outputDir = path.join(analysisRoot, job.videoId);
  await mkdir(outputDir, { recursive: true });
  const sourcePath = await resolveSourcePath(job.video, outputDir);
  const processedPath = path.join(outputDir, "processed.mp4");
  const metricsPath = path.join(outputDir, "metrics.json");
  log(`Job ${job.id}: source=${sourcePath}`);
  log(`Job ${job.id}: processed=${processedPath}`);
  log(`Job ${job.id}: metrics=${metricsPath}`);

  await updateJobProgress(job.id, 8, { force: true });
  const matchInfo = isRecord(job.video.metadata) && isRecord(job.video.metadata.matchInfo)
    ? job.video.metadata.matchInfo
    : {};
  await runPythonAnalysis(sourcePath, processedPath, metricsPath, matchInfo, async (progress) => {
    await updateJobProgress(job.id, progress);
  });
  await updateJobProgress(job.id, 97, { force: true });

  const processedStat = await stat(processedPath);
  const metricsStat = await stat(metricsPath);
  const processedSizeBytes = BigInt(processedStat.size);
  const metricsSizeBytes = BigInt(metricsStat.size);
  const metrics = JSON.parse(await readFile(metricsPath, "utf8"));
  const existingMetadata = isRecord(job.video.metadata) ? job.video.metadata : {};
  const baseMetadata = {
    ...existingMetadata,
    processedLocalPath: processedPath,
    annotatedLocalPath: processedPath,
    latestMetricsPath: metricsPath,
    processedSizeBytes: processedSizeBytes.toString(),
    metricsSizeBytes: metricsSizeBytes.toString(),
  };

  const updatedBaseMetadata = await prisma.video.updateMany({
    where: { id: job.videoId },
    data: {
      metadata: {
        ...baseMetadata,
        analysisStorageMode: isStorageConfigured() ? "local-pending-remote-upload" : "local",
      },
    },
  });
  if (updatedBaseMetadata.count !== 1) {
    await markJobFailedIfRunning(job.id, "Video was deleted during analysis.");
    log(`Job ${job.id}: video deleted while updating metadata.`);
    return;
  }

  let remoteOutputs = {};
  try {
    remoteOutputs = await uploadAnalysisOutputsIfConfigured({
      video: job.video,
      processedPath,
      metricsPath,
      processedSizeBytes,
      metricsSizeBytes,
    });
  } catch (error) {
    const uploadMessage = error instanceof Error ? error.message : String(error);
    await prisma.video.updateMany({
      where: { id: job.videoId },
      data: {
        metadata: {
          ...baseMetadata,
          analysisStorageMode: "local",
          analysisUploadError: uploadMessage.slice(0, 500),
        },
      },
    });
    throw new Error(`Analysis output upload failed: ${uploadMessage}`);
  }

  const previousProcessedSizeBytes = parseMetadataBigInt(existingMetadata.processedSizeBytes);
  const previousMetricsSizeBytes = parseMetadataBigInt(existingMetadata.metricsSizeBytes);
  const hadPreviousRemoteOutput =
    typeof existingMetadata.processedObjectKey === "string" ||
    typeof existingMetadata.annotatedObjectKey === "string" ||
    typeof existingMetadata.latestMetricsObjectKey === "string";
  const previousRemoteTotalBytes = hadPreviousRemoteOutput ? previousProcessedSizeBytes + previousMetricsSizeBytes : 0n;
  const nextRemoteTotalBytes = remoteOutputs.analysisStorageMode === "s3" ? processedSizeBytes + metricsSizeBytes : 0n;
  const remoteStorageDeltaBytes = nextRemoteTotalBytes - previousRemoteTotalBytes;

  try {
    await prisma.$transaction(async (tx) => {
      const currentVideo = await tx.video.findUnique({
        where: { id: job.videoId },
        select: { id: true, ownerId: true, durationSeconds: true },
      });
      if (!currentVideo) {
        throw new Error("VIDEO_NOT_FOUND_DURING_PROCESSING");
      }

      await tx.metricSnapshot.create({
        data: {
          videoId: job.videoId,
          jobId: job.id,
          metrics,
        },
      });

      await tx.video.updateMany({
        where: { id: job.videoId },
        data: {
          status: "COMPLETED",
          durationSeconds: Number.isFinite(metrics?.video?.durationSeconds)
            ? Math.max(1, Math.round(metrics.video.durationSeconds))
            : currentVideo.durationSeconds,
          metadata: {
            ...baseMetadata,
            ...remoteOutputs,
            analysisCompletedAt: new Date().toISOString(),
            analysisUploadError: null,
          },
        },
      });

      if (remoteStorageDeltaBytes !== 0n) {
        const owner = await tx.user.findUnique({
          where: { id: currentVideo.ownerId },
          select: { storageUsedBytes: true },
        });
        if (owner) {
          const nextUsedBytes = owner.storageUsedBytes + remoteStorageDeltaBytes;
          await tx.user.update({
            where: { id: currentVideo.ownerId },
            data: { storageUsedBytes: nextUsedBytes > 0n ? nextUsedBytes : 0n },
          });
        }
      }

      await tx.analysisJob.updateMany({
        where: { id: job.id },
        data: { status: "COMPLETED", progress: 100, endedAt: new Date() },
      });
    });
  } catch (error) {
    if (isVideoDeletedError(error)) {
      await markJobFailedIfRunning(job.id, "Video was deleted while analysis was running.");
      log(`Job ${job.id}: video deleted before completion writeback.`);
      return;
    }
    throw error;
  }
  progressWriteState.delete(job.id);

  log(`Job ${job.id} for video ${job.videoId}: RUNNING -> COMPLETED`);
}

async function uploadAnalysisOutputsIfConfigured({ video, processedPath, metricsPath, processedSizeBytes, metricsSizeBytes }) {
  if (!isStorageConfigured()) return {};

  const processedObjectKey = createAnalysisObjectKey({
    userId: video.ownerId,
    videoId: video.id,
    filename: "processed.mp4",
  });
  const metricsObjectKey = createAnalysisObjectKey({
    userId: video.ownerId,
    videoId: video.id,
    filename: "metrics.json",
  });
  const client = getStorageClient();

  await uploadFileToStorageWithRetry({
    client,
    objectKey: processedObjectKey,
    filePath: processedPath,
    contentType: "video/mp4",
    contentLength: toSafeContentLength(processedSizeBytes),
    label: "processed analysis video",
  });

  await uploadFileToStorageWithRetry({
    client,
    objectKey: metricsObjectKey,
    filePath: metricsPath,
    contentType: "application/json",
    contentLength: toSafeContentLength(metricsSizeBytes),
    label: "analysis metrics JSON",
  });

  log(`Uploaded processed analysis to storage: ${processedObjectKey}`);
  log(`Uploaded metrics JSON to storage: ${metricsObjectKey}`);

  return {
    processedObjectKey,
    annotatedObjectKey: processedObjectKey,
    latestMetricsObjectKey: metricsObjectKey,
    processedSizeBytes: processedSizeBytes.toString(),
    metricsSizeBytes: metricsSizeBytes.toString(),
    analysisStorageMode: "s3",
  };
}

async function resolveSourcePath(video, outputDir) {
  const metadata = isRecord(video.metadata) ? video.metadata : {};
  if (typeof metadata.sourceLocalPath === "string" && metadata.sourceLocalPath.trim()) {
    try {
      await stat(metadata.sourceLocalPath);
      return metadata.sourceLocalPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Source local path unavailable (${metadata.sourceLocalPath}): ${message}. Falling back to remote/local key resolution.`);
    }
  }

  const localPath = path.resolve(localStorageRoot, ...video.objectKey.split("/"));
  try {
    await stat(localPath);
    return localPath;
  } catch {
    // Continue to S3/R2 download if configured.
  }

  if (!isStorageConfigured()) {
    throw new Error("No local source video found and S3-compatible storage is not configured.");
  }

  const extension = path.extname(video.originalFilename) || ".mp4";
  const downloadPath = path.join(outputDir, `source${extension}`);
  const client = getStorageClient();

  const object = await client.send(
    new GetObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: video.objectKey,
    }),
  );
  if (!object.Body) {
    throw new Error("Storage object did not include a readable body.");
  }
  await pipeline(object.Body, createWriteStream(downloadPath));
  return downloadPath;
}

async function updateJobProgress(jobId, progress, options = {}) {
  const bounded = Math.max(0, Math.min(99, Math.round(Number(progress) || 0)));
  const previous = progressWriteState.get(jobId) || { progress: 0, writtenAt: 0 };
  const now = Date.now();
  if (!options.force && bounded < 99 && bounded - previous.progress < 3 && now - previous.writtenAt < 2000) {
    return;
  }
  await prisma.analysisJob.updateMany({
    where: {
      id: jobId,
      status: "RUNNING",
      progress: { lt: bounded },
    },
    data: { progress: bounded },
  });
  progressWriteState.set(jobId, { progress: Math.max(previous.progress, bounded), writtenAt: now });
}

async function runPythonAnalysis(sourcePath, processedPath, metricsPath, matchInfo, onProgress) {
  await stat(modelPath).catch(() => {
    throw new Error(`Missing YOLO model at ${modelPath}. Download best.pt into analysis/models/best.pt`);
  });

  const commandArgs = [
    "analysis/run_analysis.py",
    "--input",
    sourcePath,
    "--output",
    processedPath,
    "--metrics-json",
    metricsPath,
    "--model",
    modelPath,
    "--match-info",
    JSON.stringify(matchInfo || {}),
  ];

  log(`Running Python analysis: ${pythonBin} ${commandArgs.map((part) => JSON.stringify(part)).join(" ")}`);
  await new Promise((resolve, reject) => {
    const child = spawn(pythonBin, commandArgs, { cwd: root, windowsHide: true });
    let stderr = "";
    let stdout = "";
    let stdoutLineBuffer = "";
    let progressUpdate = Promise.resolve();

    const handleStdout = (text) => {
      stdout += text;
      stdoutLineBuffer += text;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() || "";
      for (const line of lines) {
        const progress = parseProgressLine(line);
        if (progress === null) continue;
        progressUpdate = progressUpdate.then(() => onProgress(progress)).catch((error) => {
          log(`Progress update warning: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    };

    child.stdout.on("data", (chunk) => {
      handleStdout(chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (stdoutLineBuffer.trim()) {
        const progress = parseProgressLine(stdoutLineBuffer.trim());
        if (progress !== null) {
          progressUpdate = progressUpdate.then(() => onProgress(progress)).catch((error) => {
            log(`Progress update warning: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
      }
      progressUpdate.finally(() => {
      if (code === 0) {
        if (stdout.trim()) log(`Python stdout:\n${stdout.trim()}`);
        if (stderr.trim()) log(`Python stderr:\n${stderr.trim()}`);
        resolve();
        return;
      }
      const sections = [
        `Python analysis exited with code ${code}`,
        stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
        stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
      ].filter(Boolean);
      reject(new Error(sections.join("\n\n")));
      });
    });
  });
}

function parseProgressLine(line) {
  const marker = "[DRIVXIS progress] ";
  if (!line.startsWith(marker)) return null;
  try {
    const payload = JSON.parse(line.slice(marker.length));
    const progress = Number(payload.progress);
    return Number.isFinite(progress) ? progress : null;
  } catch {
    return null;
  }
}

async function failJob(job, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${new Date().toISOString()}] Job ${job.id} for video ${job.videoId}: RUNNING -> FAILED`);
  console.error(message);
  progressWriteState.delete(job.id);
  try {
    await prisma.analysisJob.updateMany({
      where: { id: job.id },
      data: { status: "FAILED", progress: 100, error: message.slice(0, 2000), endedAt: new Date() },
    });
    await prisma.video.updateMany({
      where: { id: job.videoId },
      data: { status: "FAILED" },
    });
  } catch (nestedError) {
    const nestedMessage = nestedError instanceof Error ? nestedError.message : String(nestedError);
    console.error(`[${new Date().toISOString()}] failJob warning for ${job.id}: ${nestedMessage}`);
  }
}

async function markJobFailedIfRunning(jobId, reason) {
  progressWriteState.delete(jobId);
  await prisma.analysisJob.updateMany({
    where: { id: jobId, status: { in: ["RUNNING", "QUEUED"] } },
    data: { status: "FAILED", progress: 100, error: String(reason).slice(0, 2000), endedAt: new Date() },
  });
}

function isVideoDeletedError(error) {
  if (!error) return false;
  if (error instanceof Error && error.message === "VIDEO_NOT_FOUND_DURING_PROCESSING") return true;
  const prismaError = error;
  return prismaError?.code === "P2025" || prismaError?.code === "P2003";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadataBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return BigInt(Math.round(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

async function uploadFileToStorageWithRetry({
  client,
  objectKey,
  filePath,
  contentType,
  contentLength,
  label,
}) {
  let lastError = null;

  for (let attempt = 1; attempt <= analysisUploadMaxAttempts; attempt += 1) {
    const readStream = createReadStream(filePath);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: process.env.STORAGE_BUCKET,
          Key: objectKey,
          Body: readStream,
          ContentType: contentType,
          ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
        }),
      );
      if (attempt > 1) {
        log(`Upload recovered for ${label} (${objectKey}) on attempt ${attempt}/${analysisUploadMaxAttempts}.`);
      }
      return;
    } catch (error) {
      lastError = error;
      readStream.destroy();

      const transient = isTransientUploadError(error);
      const canRetry = transient && attempt < analysisUploadMaxAttempts;
      const message = error instanceof Error ? error.message : String(error);
      log(
        `Upload attempt ${attempt}/${analysisUploadMaxAttempts} failed for ${label} (${objectKey}). transient=${transient}. error=${message}`,
      );

      if (!canRetry) break;
      await wait(getUploadBackoffDelayMs(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown upload error"));
}

function isTransientUploadError(error) {
  if (!error) return false;
  const candidate = error;
  const code = String(candidate?.code || candidate?.Code || "").toUpperCase();
  const name = String(candidate?.name || "").toUpperCase();
  const message = String(candidate?.message || error).toLowerCase();
  const status = Number(candidate?.$metadata?.httpStatusCode || 0);

  if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "EPIPE" || code === "ECONNABORTED") return true;
  if (name === "TIMEOUTERROR" || name === "NETWORKINGERROR" || name === "REQUESTTIMEOUT") return true;
  if (status >= 500 && status <= 599) return true;
  return /socket hang up|connection reset|connection aborted|broken pipe|timed out|timeout/.test(message);
}

function getUploadBackoffDelayMs(attempt) {
  const exponential = analysisUploadBaseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(analysisUploadMaxDelayMs, exponential + jitter);
}

function toSafeContentLength(sizeBytes) {
  if (typeof sizeBytes !== "bigint" || sizeBytes < 0n) return undefined;
  const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
  if (sizeBytes > maxSafe) return undefined;
  return Number(sizeBytes);
}

function isStorageConfigured() {
  return Boolean(
    process.env.STORAGE_ENDPOINT &&
    process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY
  );
}

function shouldForcePathStyle(endpoint) {
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

function createAnalysisObjectKey({ userId, videoId, filename }) {
  const safeVideoId = String(videoId).replace(/[^\w-]+/g, "-").slice(0, 120) || crypto.randomUUID();
  const safeFilename = String(filename)
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140) || "analysis-output";
  return `users/${userId}/analysis/${safeVideoId}/${safeFilename}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampEnvInteger(rawValue, fallback, { min, max }) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function loadDotEnv(envPath) {
  try {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional for environments that provide variables directly.
  }
}
