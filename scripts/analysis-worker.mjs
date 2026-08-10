import { createReadStream, createWriteStream } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { isTransientUploadError } from "./analysis-upload-retry.mjs";

const root = process.cwd();
loadDotEnv(path.join(root, ".env"));

const { PrismaClient } = await import("@prisma/client");
const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } = await import("@aws-sdk/client-s3");

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
const detector = normalizeDetector(process.env.ANALYSIS_DETECTOR || "yolo");
const modelPath = path.resolve(root, process.env.ANALYSIS_MODEL_PATH || "analysis/models/best.pt");
const modelObjectKey = (process.env.ANALYSIS_MODEL_OBJECT_KEY || "").trim();
const modelUrl = (process.env.ANALYSIS_MODEL_URL || "").trim();
const modelId = process.env.LOCATEANYTHING_MODEL_ID || "nvidia/LocateAnything-3B";
const modelRevision = process.env.LOCATEANYTHING_REVISION || "c32291ca5e996f5a7a485845b4f57a233936bba0";
const detectionFps = clampEnvNumber(
  process.env.ANALYSIS_DETECTION_FPS || process.env.LOCATEANYTHING_DETECTION_FPS,
  5,
  { min: 0.1, max: 30 },
);
const inferenceBatchSize = clampEnvInteger(
  process.env.ANALYSIS_BATCH_SIZE || process.env.LOCATEANYTHING_BATCH_SIZE,
  4,
  { min: 1, max: 8 },
);
const localStorageRoot = path.resolve(root, process.env.LOCAL_STORAGE_ROOT || ".drivxis/uploads");
const analysisRoot = path.resolve(root, process.env.ANALYSIS_STORAGE_ROOT || ".drivxis/analysis");
const progressWriteState = new Map();
const heartbeatIntervalMs = clampEnvInteger(process.env.ANALYSIS_HEARTBEAT_INTERVAL_MS, 60000, { min: 10000, max: 300000 });
const analysisCancelPollMs = clampEnvInteger(process.env.ANALYSIS_CANCEL_POLL_MS, 1000, { min: 250, max: 5000 });
const staleJobMinutes = clampEnvInteger(process.env.ANALYSIS_STALE_JOB_MINUTES, 30, { min: 5, max: 1440 });
const analysisUploadMaxAttempts = clampEnvInteger(process.env.ANALYSIS_UPLOAD_MAX_ATTEMPTS, 4, { min: 1, max: 8 });
const analysisUploadBaseDelayMs = clampEnvInteger(process.env.ANALYSIS_UPLOAD_BASE_DELAY_MS, 800, { min: 100, max: 15000 });
const analysisUploadMaxDelayMs = clampEnvInteger(process.env.ANALYSIS_UPLOAD_MAX_DELAY_MS, 6000, { min: 500, max: 30000 });

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

class AnalysisCancelledError extends Error {
  constructor(jobId) {
    super(`Analysis job ${jobId} was cancelled by the user.`);
    this.name = "AnalysisCancelledError";
  }
}

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

try {
  await runWorker();
} catch (error) {
  log(`Worker stopped: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}

async function runWorker() {
  log(`DRIVXIS analysis worker online. once=${once}`);
  log(`pythonBin=${pythonBin}`);
  log(`detector=${detector}`);
  log(`model=${detector === "yolo" ? modelPath : `${modelId}@${modelRevision}`}`);
  log(`detectionFps=${detectionFps} batchSize=${inferenceBatchSize}`);
  log(`localStorageRoot=${localStorageRoot}`);
  log(`analysisRoot=${analysisRoot}`);
  if (detector === "yolo") await ensureYoloModel();
  await verifyPythonRuntime();
  if (process.platform === "linux") {
    await writeFile("/tmp/drivxis-analysis-ready", `${detector}\n`, "utf8");
  }
  await recoverStaleJobs();
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

async function verifyPythonRuntime() {
  const commandArgs = ["analysis/check_runtime.py"];
  const result = await new Promise((resolve, reject) => {
    const child = spawn(pythonBin, commandArgs, { cwd: root, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
  });
  if (result.code !== 0) {
    throw new Error(
      [
        `Analysis worker runtime preflight exited with code ${result.code}.`,
        result.stderr,
        result.stdout,
      ].filter(Boolean).join("\n"),
    );
  }
  log(`${detector} runtime preflight passed: ${result.stdout}`);
}

async function ensureYoloModel() {
  try {
    const existing = await stat(modelPath);
    if (existing.isFile() || existing.isDirectory()) return;
  } catch {
    // Download the configured model below.
  }

  await mkdir(path.dirname(modelPath), { recursive: true });
  if (modelObjectKey) {
    if (!isStorageConfigured()) {
      throw new Error(
        "ANALYSIS_MODEL_OBJECT_KEY is set, but R2/S3 storage credentials are not configured.",
      );
    }
    log(`Downloading YOLO model from storage key ${modelObjectKey} to ${modelPath}`);
    const object = await getStorageClient().send(
      new GetObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: modelObjectKey }),
    );
    if (!object.Body) throw new Error(`Model object ${modelObjectKey} did not include a readable body.`);
    await writeModelAtomically(object.Body);
    return;
  }

  if (modelUrl) {
    log(`Downloading YOLO model from ANALYSIS_MODEL_URL to ${modelPath}`);
    const response = await fetch(modelUrl);
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed with HTTP ${response.status} ${response.statusText}.`);
    }
    await writeModelAtomically(Readable.fromWeb(response.body));
    return;
  }

  throw new Error(
    `YOLO model not found at ${modelPath}. Provide ANALYSIS_MODEL_PATH, ANALYSIS_MODEL_OBJECT_KEY, or ANALYSIS_MODEL_URL.`,
  );
}

async function writeModelAtomically(body) {
  const temporaryPath = `${modelPath}.download`;
  await rm(temporaryPath, { force: true });
  try {
    await pipeline(body, createWriteStream(temporaryPath, { flags: "wx" }));
    const downloaded = await stat(temporaryPath);
    if (!downloaded.isFile() || downloaded.size <= 0) {
      throw new Error("Downloaded YOLO model is empty.");
    }
    await rename(temporaryPath, modelPath);
    log(`YOLO model cache ready: ${modelPath} (${downloaded.size} bytes)`);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function recoverStaleJobs() {
  const cutoff = new Date(Date.now() - staleJobMinutes * 60 * 1000);
  const staleJobs = await prisma.analysisJob.findMany({
    where: { status: "RUNNING", updatedAt: { lt: cutoff } },
    select: { id: true, videoId: true },
  });
  for (const staleJob of staleJobs) {
    const reason = `Analysis worker heartbeat expired after ${staleJobMinutes} minutes.`;
    const failed = await prisma.analysisJob.updateMany({
      where: { id: staleJob.id, status: "RUNNING", updatedAt: { lt: cutoff } },
      data: { status: "FAILED", progress: 100, error: reason, endedAt: new Date() },
    });
    if (failed.count !== 1) continue;
    await prisma.video.updateMany({
      where: { id: staleJob.videoId, status: "PROCESSING" },
      data: { status: "FAILED" },
    });
    log(`Recovered stale job ${staleJob.id}: RUNNING -> FAILED`);
  }
}

function startJobHeartbeat(jobId) {
  const touch = () => {
    prisma.analysisJob.updateMany({
      where: { id: jobId, status: "RUNNING" },
      data: { updatedAt: new Date() },
    }).catch((error) => {
      log(`Job ${jobId} heartbeat warning: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
  touch();
  const timer = setInterval(touch, heartbeatIntervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

async function processJob(job) {
  const startedAtMs = Date.now();
  const stopHeartbeat = startJobHeartbeat(job.id);
  try {
    await processJobBody(job);
  } finally {
    stopHeartbeat();
    const elapsedSeconds = ((Date.now() - startedAtMs) / 1000).toFixed(1);
    log(`Job ${job.id}: worker elapsed=${elapsedSeconds}s`);
  }
}

async function processJobBody(job) {
  if (!job.video) {
    await markJobFailedIfRunning(job.id, "Video no longer exists.");
    return;
  }
  const outputDir = path.join(analysisRoot, job.videoId);
  await mkdir(outputDir, { recursive: true });
  const sourcePath = await resolveSourcePath(job.video, outputDir);
  await assertJobStillRunning(job.id);
  const processedPath = path.join(outputDir, "processed.mp4");
  const metricsPath = path.join(outputDir, "metrics.json");
  log(`Job ${job.id}: source=${sourcePath}`);
  log(`Job ${job.id}: processed=${processedPath}`);
  log(`Job ${job.id}: metrics=${metricsPath}`);

  await updateJobProgress(job.id, 8, { force: true });
  const matchInfo = isRecord(job.video.metadata) && isRecord(job.video.metadata.matchInfo)
    ? job.video.metadata.matchInfo
    : {};
  await runPythonAnalysis(sourcePath, processedPath, metricsPath, matchInfo, job.id, async (progress) => {
    await updateJobProgress(job.id, progress);
  });
  await assertJobStillRunning(job.id);
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
    where: {
      id: job.videoId,
      analysisJobs: { some: { id: job.id, status: "RUNNING" } },
    },
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
    await assertJobStillRunning(job.id);
    remoteOutputs = await uploadAnalysisOutputsIfConfigured({
      jobId: job.id,
      video: job.video,
      processedPath,
      metricsPath,
      processedSizeBytes,
      metricsSizeBytes,
    });
    await assertJobStillRunning(job.id);
  } catch (error) {
    if (error instanceof AnalysisCancelledError) {
      await deleteUploadedAnalysisObjects([
        remoteOutputs.processedObjectKey,
        remoteOutputs.latestMetricsObjectKey,
      ]);
      throw error;
    }
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
      const completedJob = await tx.analysisJob.updateMany({
        where: { id: job.id, status: "RUNNING" },
        data: { status: "COMPLETED", progress: 100, endedAt: new Date() },
      });
      if (completedJob.count !== 1) {
        throw new Error("ANALYSIS_JOB_NO_LONGER_RUNNING");
      }

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
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ANALYSIS_JOB_NO_LONGER_RUNNING") {
      log(`Job ${job.id}: completion ignored because its heartbeat lease was no longer active.`);
      return;
    }
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

async function uploadAnalysisOutputsIfConfigured({ jobId, video, processedPath, metricsPath, processedSizeBytes, metricsSizeBytes }) {
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
  const uploadedKeys = [];

  try {
    await assertJobStillRunning(jobId);
    await uploadFileToStorageWithRetry({
      client,
      objectKey: processedObjectKey,
      filePath: processedPath,
      contentType: "video/mp4",
      contentLength: toSafeContentLength(processedSizeBytes),
      label: "processed analysis video",
    });
    uploadedKeys.push(processedObjectKey);

    await assertJobStillRunning(jobId);
    await uploadFileToStorageWithRetry({
      client,
      objectKey: metricsObjectKey,
      filePath: metricsPath,
      contentType: "application/json",
      contentLength: toSafeContentLength(metricsSizeBytes),
      label: "analysis metrics JSON",
    });
    uploadedKeys.push(metricsObjectKey);
    await assertJobStillRunning(jobId);
  } catch (error) {
    if (error instanceof AnalysisCancelledError) {
      await deleteUploadedAnalysisObjects(uploadedKeys, client);
    }
    throw error;
  }

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

async function deleteUploadedAnalysisObjects(objectKeys, existingClient) {
  const keys = Array.from(new Set(objectKeys.filter((value) => typeof value === "string" && value)));
  if (!isStorageConfigured() || keys.length === 0) return;
  const client = existingClient || getStorageClient();
  for (const objectKey of keys) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: process.env.STORAGE_BUCKET, Key: objectKey }));
      log(`Removed cancelled analysis output: ${objectKey}`);
    } catch (error) {
      log(`Cancelled output cleanup warning for ${objectKey}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
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

async function runPythonAnalysis(sourcePath, processedPath, metricsPath, matchInfo, jobId, onProgress) {
  const commandArgs = [
    "analysis/run_analysis.py",
    "--input",
    sourcePath,
    "--output",
    processedPath,
    "--metrics-json",
    metricsPath,
    "--detector",
    detector,
    "--model",
    modelPath,
    "--model-id",
    modelId,
    "--model-revision",
    modelRevision,
    "--detection-fps",
    String(detectionFps),
    "--batch-size",
    String(inferenceBatchSize),
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
    let closed = false;
    let cancellationRequested = false;
    let cancellationCheckRunning = false;

    const stopChildForCancellation = async () => {
      if (closed || cancellationRequested || cancellationCheckRunning) return;
      cancellationCheckRunning = true;
      try {
        const activeJob = await prisma.analysisJob.findFirst({
          where: { id: jobId, status: "RUNNING" },
          select: { id: true },
        });
        if (activeJob) return;
        cancellationRequested = true;
        log(`Job ${jobId}: cancellation detected; stopping Python process ${child.pid ?? "unknown"}.`);
        child.kill("SIGTERM");
        const forceKillTimer = setTimeout(() => {
          if (!closed) child.kill("SIGKILL");
        }, 5000);
        forceKillTimer.unref();
      } catch (error) {
        log(`Job ${jobId} cancellation check warning: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        cancellationCheckRunning = false;
      }
    };
    const cancellationTimer = setInterval(() => void stopChildForCancellation(), analysisCancelPollMs);
    cancellationTimer.unref();

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
    child.on("error", (error) => {
      clearInterval(cancellationTimer);
      reject(error);
    });
    child.on("close", (code) => {
      closed = true;
      clearInterval(cancellationTimer);
      if (stdoutLineBuffer.trim()) {
        const progress = parseProgressLine(stdoutLineBuffer.trim());
        if (progress !== null) {
          progressUpdate = progressUpdate.then(() => onProgress(progress)).catch((error) => {
            log(`Progress update warning: ${error instanceof Error ? error.message : String(error)}`);
          });
        }
      }
      progressUpdate.finally(() => {
        if (cancellationRequested) {
          reject(new AnalysisCancelledError(jobId));
          return;
        }
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
  if (error instanceof AnalysisCancelledError) {
    progressWriteState.delete(job.id);
    log(`Job ${job.id} for video ${job.videoId}: cancellation completed.`);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[${new Date().toISOString()}] Job ${job.id} for video ${job.videoId}: RUNNING -> FAILED`);
  console.error(message);
  progressWriteState.delete(job.id);
  try {
    const failedJob = await prisma.analysisJob.updateMany({
      where: { id: job.id, status: "RUNNING" },
      data: { status: "FAILED", progress: 100, error: message.slice(0, 2000), endedAt: new Date() },
    });
    if (failedJob.count !== 1) {
      log(`Job ${job.id}: failure write ignored because the job is no longer running.`);
      return;
    }
    await prisma.video.updateMany({
      where: { id: job.videoId, status: "PROCESSING" },
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

async function assertJobStillRunning(jobId) {
  const activeJob = await prisma.analysisJob.findFirst({
    where: { id: jobId, status: "RUNNING" },
    select: { id: true },
  });
  if (!activeJob) throw new AnalysisCancelledError(jobId);
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

function clampEnvNumber(rawValue, fallback, { min, max }) {
  const parsed = Number.parseFloat(String(rawValue ?? ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeDetector(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "yolo" || normalized === "locateanything") return normalized;
  throw new Error(`Unsupported ANALYSIS_DETECTOR: ${value}. Expected yolo or locateanything.`);
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
