import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";

const repositoryUrl =
  process.env.ANALYSIS_SANDBOX_REPOSITORY_URL ||
  "https://github.com/ceshez/DRIVXIS-Plataforma-de-analisis-de-futbol.git";
const repositoryDirectory =
  process.env.ANALYSIS_SANDBOX_REPOSITORY_DIR || "DRIVXIS-Plataforma-de-analisis-de-futbol";
const branch = process.env.ANALYSIS_SANDBOX_GIT_BRANCH || "main";
const modelLocalPath = path.resolve(
  process.cwd(),
  process.env.ANALYSIS_MODEL_LOCAL_PATH || "analysis/models/best.onnx",
);
const modelSandboxPath = process.env.ANALYSIS_SANDBOX_MODEL_PATH || "/home/ubuntu/models/best.onnx";

const model = await readFile(modelLocalPath);
const expectedModelSha = createHash("sha256").update(model).digest("hex");
let sandbox;

try {
  console.log("Creating DRIVXIS analysis Sandbox from main...");
  sandbox = await Sandbox.create({
    image: "vercel/sandbox/universal:latest",
    source: {
      type: "git",
      url: repositoryUrl,
      revision: branch,
      depth: 1,
    },
    resources: { vcpus: 4 },
    timeout: 2_700_000,
    persistent: false,
    tags: {
      application: "drivxis",
      purpose: "analysis-snapshot",
    },
  });

  await run("apt-get", ["update"], { sudo: true });
  await run(
    "apt-get",
    [
      "install",
      "-y",
      "--no-install-recommends",
      "ffmpeg",
      "libglib2.0-0",
      "libgl1",
      "libgomp1",
      "python3-venv",
    ],
    { sudo: true },
  );
  await run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: repositoryDirectory,
  });
  await run("npx", ["prisma", "generate"], { cwd: repositoryDirectory });
  await run("python", ["-m", "venv", ".venv-analysis"], { cwd: repositoryDirectory });
  await run(
    ".venv-analysis/bin/python",
    ["-m", "pip", "install", "--upgrade", "pip"],
    { cwd: repositoryDirectory },
  );
  await run(
    ".venv-analysis/bin/python",
    ["-m", "pip", "install", "--no-input", "-r", "analysis/requirements.txt"],
    { cwd: repositoryDirectory },
  );

  console.log(`Uploading ${model.length} bytes of model data outside GitHub...`);
  await sandbox.mkDir(path.posix.dirname(modelSandboxPath), { recursive: true });
  await sandbox.writeFiles([{ path: modelSandboxPath, content: model }]);
  const remoteHash = await run("sha256sum", [modelSandboxPath]);
  if (!remoteHash.stdout.startsWith(expectedModelSha)) {
    throw new Error(`Model checksum mismatch. Expected ${expectedModelSha}, received ${remoteHash.stdout.trim()}.`);
  }

  await run(
    ".venv-analysis/bin/python",
    ["analysis/check_runtime.py"],
    {
      cwd: repositoryDirectory,
      env: {
        ANALYSIS_DETECTOR: "yolo",
        ANALYSIS_MODEL_PATH: modelSandboxPath,
      },
    },
  );

  console.log("Saving a non-expiring Vercel Sandbox snapshot...");
  const snapshot = await sandbox.snapshot({ expiration: 0 });
  sandbox = undefined;
  console.log(`ANALYSIS_SANDBOX_SNAPSHOT_ID=${snapshot.snapshotId}`);
  console.log(`MODEL_SHA256=${expectedModelSha}`);
} catch (error) {
  if (sandbox) await sandbox.stop().catch(() => undefined);
  throw error;
}

async function run(cmd, args, options = {}) {
  console.log(`> ${cmd} ${args.join(" ")}`);
  const result = await sandbox.runCommand({
    cmd,
    args,
    ...options,
    stdout: process.stdout,
    stderr: process.stderr,
  });
  if (result.exitCode !== 0) {
    throw new Error(`${cmd} failed with exit code ${result.exitCode}.`);
  }
  return {
    exitCode: result.exitCode,
    stdout: await result.stdout(),
    stderr: await result.stderr(),
  };
}
