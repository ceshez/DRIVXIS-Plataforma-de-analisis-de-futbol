import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import type { StdioOptions } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/prisma";

type AnalysisWorkerMode = "disabled" | "local" | "vercel-sandbox";

type AnalysisWorkerModeOptions = {
  autoStart?: string;
  mode?: string;
  platform?: NodeJS.Platform;
  detector?: string;
};

const SANDBOX_ENV_KEYS = [
  "DATABASE_URL",
  "STORAGE_ENDPOINT",
  "STORAGE_REGION",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
  "ANALYSIS_DETECTOR",
  "ANALYSIS_MODEL_OBJECT_KEY",
  "ANALYSIS_MODEL_URL",
  "ANALYSIS_DETECTION_FPS",
  "ANALYSIS_BATCH_SIZE",
  "ANALYSIS_MAX_WIDTH",
  "ANALYSIS_HEARTBEAT_INTERVAL_MS",
  "ANALYSIS_CANCEL_POLL_MS",
  "ANALYSIS_STALE_JOB_MINUTES",
  "ANALYSIS_UPLOAD_MAX_ATTEMPTS",
  "ANALYSIS_UPLOAD_BASE_DELAY_MS",
  "ANALYSIS_UPLOAD_MAX_DELAY_MS",
  "YOLO_DEVICE",
  "YOLO_IMAGE_SIZE",
  "YOLO_PROCESS_EVERY_FRAME",
  "YOLO_FALLBACK_IMAGE_SIZE",
  "YOLO_SPARSE_PLAYER_THRESHOLD",
  "YOLO_SPARSE_PLAYER_MAX_HEIGHT_RATIO",
  "YOLO_CONFIDENCE",
] as const;

const SANDBOX_REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "STORAGE_ENDPOINT",
  "STORAGE_BUCKET",
  "STORAGE_ACCESS_KEY_ID",
  "STORAGE_SECRET_ACCESS_KEY",
] as const;

const SANDBOX_LAUNCH_LEASE_MS = 5 * 60 * 1000;

const globalForAnalysisWorker = globalThis as typeof globalThis & {
  drivxisAnalysisKickAt?: Record<string, number>;
};

export function shouldAutoStartAnalysisWorker(
  options: { autoStart?: string; platform?: NodeJS.Platform; detector?: string } = {},
) {
  const autoStart = options.autoStart ?? process.env.ANALYSIS_AUTO_START;
  const platform = options.platform ?? process.platform;
  const detector = (options.detector ?? process.env.ANALYSIS_DETECTOR ?? "yolo").toLowerCase();
  if (autoStart !== "true") return false;
  return detector === "locateanything" ? platform === "linux" : detector === "yolo";
}

export function getAnalysisWorkerMode(options: AnalysisWorkerModeOptions = {}): AnalysisWorkerMode {
  if (!shouldAutoStartAnalysisWorker(options)) return "disabled";

  const mode = (options.mode ?? process.env.ANALYSIS_WORKER_MODE ?? "local").trim().toLowerCase();
  if (mode === "vercel-sandbox") return "vercel-sandbox";
  return mode === "local" ? "local" : "disabled";
}

export function getAnalysisJobTarget(jobId?: string) {
  const normalizedJobId = jobId?.trim() || null;
  return {
    jobId: normalizedJobId,
    where: normalizedJobId ? { id: normalizedJobId } : {},
  };
}

export async function kickAnalysisWorker(jobId?: string) {
  const mode = getAnalysisWorkerMode();
  if (mode === "disabled") return;

  const target = getAnalysisJobTarget(jobId);
  const throttleKey = target.jobId || "queue";
  const now = Date.now();
  const kickTimes = globalForAnalysisWorker.drivxisAnalysisKickAt ?? {};
  const lastKick = kickTimes[throttleKey] ?? 0;
  if (now - lastKick < 2500) return;
  kickTimes[throttleKey] = now;
  globalForAnalysisWorker.drivxisAnalysisKickAt = kickTimes;

  if (mode === "vercel-sandbox") {
    const reservation = await reserveQueuedSandboxJob(target.jobId);
    if (!reservation) return;

    try {
      await kickVercelSandboxWorker(reservation.jobId);
    } catch (error) {
      await releaseQueuedSandboxJob(reservation.jobId, reservation.startedAt);
      throw error;
    }
    return;
  }

  kickLocalAnalysisWorker(target.jobId);
}

async function reserveQueuedSandboxJob(jobId: string | null) {
  const target = getAnalysisJobTarget(jobId ?? undefined);
  const staleBefore = new Date(Date.now() - SANDBOX_LAUNCH_LEASE_MS);
  const availableLease = {
    OR: [{ startedAt: null }, { startedAt: { lt: staleBefore } }],
  };
  const job = await prisma.analysisJob.findFirst({
    where: {
      status: "QUEUED",
      ...target.where,
      ...availableLease,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!job) return null;

  const startedAt = new Date();
  const reserved = await prisma.analysisJob.updateMany({
    where: {
      id: job.id,
      status: "QUEUED",
      ...availableLease,
    },
    data: { startedAt },
  });
  return reserved.count === 1 ? { jobId: job.id, startedAt } : null;
}

async function releaseQueuedSandboxJob(jobId: string, startedAt: Date) {
  await prisma.analysisJob.updateMany({
    where: { id: jobId, status: "QUEUED", startedAt },
    data: { startedAt: null },
  });
}

async function kickVercelSandboxWorker(jobId: string) {
  const snapshotId = process.env.ANALYSIS_SANDBOX_SNAPSHOT_ID?.trim();
  if (!snapshotId) {
    throw new Error("ANALYSIS_SANDBOX_SNAPSHOT_ID is required for the Vercel Sandbox worker.");
  }

  const environment = getSandboxWorkerEnvironment(jobId);
  const timeout = clampInteger(process.env.ANALYSIS_SANDBOX_TIMEOUT_MS, 2_700_000, 60_000, 2_700_000);
  const vcpus = clampInteger(process.env.ANALYSIS_SANDBOX_VCPUS, 4, 1, 4);
  const repositoryDirectory =
    process.env.ANALYSIS_SANDBOX_REPOSITORY_DIR?.trim() || "DRIVXIS-Plataforma-de-analisis-de-futbol";
  const { Sandbox } = await import("@vercel/sandbox");
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId },
    timeout,
    resources: { vcpus },
    persistent: false,
    env: environment,
    tags: {
      application: "drivxis",
      purpose: "analysis-worker",
    },
  });

  try {
    await sandbox.runCommand({
      cmd: "bash",
      args: [
        "-lc",
        'git fetch --depth 1 origin "$ANALYSIS_SANDBOX_GIT_BRANCH" && git reset --hard FETCH_HEAD && bash scripts/run-analysis-sandbox-worker.sh',
      ],
      cwd: repositoryDirectory,
      detached: true,
      timeoutMs: Math.max(30_000, timeout - 15_000),
    });
    console.info(`DRIVXIS analysis Sandbox started: ${sandbox.name}`);
  } catch (error) {
    await sandbox.stop().catch(() => undefined);
    throw error;
  }
}

function getSandboxWorkerEnvironment(jobId: string) {
  const missing = SANDBOX_REQUIRED_ENV_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing Vercel Sandbox worker variables: ${missing.join(", ")}`);
  }

  const environment: Record<string, string> = {};
  for (const key of SANDBOX_ENV_KEYS) {
    const value = process.env[key];
    if (value !== undefined) environment[key] = value;
  }

  environment.NODE_ENV = "production";
  environment.ANALYSIS_AUTO_START = "false";
  environment.ANALYSIS_JOB_ID = jobId;
  environment.ANALYSIS_MODEL_PATH =
    process.env.ANALYSIS_SANDBOX_MODEL_PATH?.trim() || "/home/ubuntu/models/best.onnx";
  environment.PYTHON_BIN =
    process.env.ANALYSIS_SANDBOX_PYTHON_BIN?.trim() || ".venv-analysis/bin/python";
  environment.LOCAL_STORAGE_ROOT = "/tmp/drivxis/uploads";
  environment.ANALYSIS_STORAGE_ROOT = "/tmp/drivxis/analysis";
  environment.ANALYSIS_SANDBOX_GIT_BRANCH =
    process.env.ANALYSIS_SANDBOX_GIT_BRANCH?.trim() || "main";
  return environment;
}

function kickLocalAnalysisWorker(jobId: string | null) {
  const root = process.cwd();
  const nodeExecutable = process.execPath;
  const workerPath = path.join(root, "scripts", "analysis-worker.mjs");
  if (!existsSync(workerPath)) return;

  const workerLog = createWorkerLogStdio(root);
  try {
    const child = spawn(nodeExecutable, [workerPath, "--once"], {
      cwd: root,
      detached: true,
      stdio: workerLog.stdio,
      windowsHide: true,
      env: {
        ...process.env,
        ...(jobId ? { ANALYSIS_JOB_ID: jobId } : {}),
      },
    });
    child.unref();
  } finally {
    workerLog.close();
  }
}

function createWorkerLogStdio(root: string) {
  const analysisRoot = path.resolve(root, process.env.ANALYSIS_STORAGE_ROOT || ".drivxis/analysis");
  try {
    mkdirSync(analysisRoot, { recursive: true });
    const logPath = path.join(analysisRoot, "worker.log");
    const outFd = openSync(logPath, "a");
    const errFd = openSync(logPath, "a");
    return {
      stdio: ["ignore", outFd, errFd] as StdioOptions,
      close() {
        closeSync(outFd);
        closeSync(errFd);
      },
    };
  } catch (error) {
    console.error("DRIVXIS could not open analysis worker log:", error);
    return {
      stdio: "ignore" as StdioOptions,
      close() {},
    };
  }
}

function clampInteger(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
