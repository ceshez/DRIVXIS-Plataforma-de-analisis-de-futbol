import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import type { StdioOptions } from "node:child_process";
import path from "node:path";

const globalForAnalysisWorker = globalThis as typeof globalThis & {
  drivxisAnalysisKickAt?: number;
};

function shouldAutoStartAnalysisWorker() {
  if (process.env.ANALYSIS_AUTO_START) {
    return process.env.ANALYSIS_AUTO_START === "true";
  }
  return process.env.NODE_ENV !== "production";
}

export function kickAnalysisWorker() {
  if (!shouldAutoStartAnalysisWorker()) return;

  const now = Date.now();
  const lastKick = globalForAnalysisWorker.drivxisAnalysisKickAt ?? 0;
  if (now - lastKick < 2500) return;
  globalForAnalysisWorker.drivxisAnalysisKickAt = now;

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
      env: process.env,
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
