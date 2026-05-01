import { createWriteStream } from "node:fs";
import { readFileSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

const root = process.cwd();
loadDotEnv(path.join(root, ".env"));

const { PrismaClient } = await import("@prisma/client");
const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");

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

  const claimed = await prisma.analysisJob.updateMany({
    where: { id: job.id, status: "QUEUED" },
    data: { status: "RUNNING", progress: 5, error: null, startedAt: new Date() },
  });
  if (claimed.count !== 1) return null;

  log(`Job ${job.id} for video ${job.videoId}: QUEUED -> RUNNING`);
  await prisma.video.update({
    where: { id: job.videoId },
    data: { status: "PROCESSING" },
  });

  return { ...job, status: "RUNNING" };
}

async function processJob(job) {
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

  const metrics = JSON.parse(await readFile(metricsPath, "utf8"));
  const existingMetadata = isRecord(job.video.metadata) ? job.video.metadata : {};
  await prisma.metricSnapshot.create({
    data: {
      videoId: job.videoId,
      jobId: job.id,
      metrics,
    },
  });

  await prisma.video.update({
    where: { id: job.videoId },
    data: {
      status: "COMPLETED",
      durationSeconds: Number.isFinite(metrics?.video?.durationSeconds)
        ? Math.max(1, Math.round(metrics.video.durationSeconds))
        : job.video.durationSeconds,
      metadata: {
        ...existingMetadata,
        processedLocalPath: processedPath,
        annotatedLocalPath: processedPath,
        latestMetricsPath: metricsPath,
        analysisCompletedAt: new Date().toISOString(),
      },
    },
  });

  await prisma.analysisJob.update({
    where: { id: job.id },
    data: { status: "COMPLETED", progress: 100, endedAt: new Date() },
  });
  progressWriteState.delete(job.id);

  log(`Job ${job.id} for video ${job.videoId}: RUNNING -> COMPLETED`);
}

async function resolveSourcePath(video, outputDir) {
  const metadata = isRecord(video.metadata) ? video.metadata : {};
  if (typeof metadata.sourceLocalPath === "string") {
    await stat(metadata.sourceLocalPath);
    return metadata.sourceLocalPath;
  }

  const localPath = path.resolve(localStorageRoot, ...video.objectKey.split("/"));
  try {
    await stat(localPath);
    return localPath;
  } catch {
    // Continue to S3 download if configured.
  }

  if (!isStorageConfigured()) {
    throw new Error("No local source video found and S3 storage is not configured.");
  }

  const extension = path.extname(video.originalFilename) || ".mp4";
  const downloadPath = path.join(outputDir, `source${extension}`);
  const client = new S3Client({
    region: process.env.STORAGE_REGION || "auto",
    endpoint: process.env.STORAGE_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.STORAGE_ENDPOINT?.includes("localhost")),
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || "",
    },
  });

  const object = await client.send(
    new GetObjectCommand({
      Bucket: process.env.STORAGE_BUCKET,
      Key: video.objectKey,
    }),
  );
  if (!object.Body) {
    throw new Error("S3 object did not include a readable body.");
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
  await prisma.analysisJob.update({
    where: { id: job.id },
    data: { status: "FAILED", progress: 100, error: message.slice(0, 2000), endedAt: new Date() },
  });
  await prisma.video.update({
    where: { id: job.videoId },
    data: { status: "FAILED" },
  });
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStorageConfigured() {
  return Boolean(
    process.env.STORAGE_BUCKET &&
      process.env.STORAGE_ACCESS_KEY_ID &&
      process.env.STORAGE_SECRET_ACCESS_KEY
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
