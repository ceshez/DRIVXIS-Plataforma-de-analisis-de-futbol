import { mkdir } from "node:fs/promises";
import path from "node:path";

export function getLocalStorageRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.LOCAL_STORAGE_ROOT || ".drivxis/uploads",
  );
}

export function getAnalysisStorageRoot() {
  return path.resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    process.env.ANALYSIS_STORAGE_ROOT || ".drivxis/analysis",
  );
}

export function assertSafeObjectKey(objectKey: string) {
  if (!objectKey || objectKey.includes("\\") || objectKey.includes("\0")) {
    throw new Error("Llave de storage invalida.");
  }

  const parts = objectKey.split("/");
  if (parts.some((part) => part === ".." || part === "")) {
    throw new Error("Llave de storage insegura.");
  }
}

function resolveInside(root: string, relativePath: string) {
  const resolved = path.resolve(root, ...relativePath.split("/"));
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new Error("La ruta resuelta queda fuera del storage permitido.");
  }
  return resolved;
}

export function getLocalObjectPath(objectKey: string) {
  assertSafeObjectKey(objectKey);
  return resolveInside(getLocalStorageRoot(), objectKey);
}

export async function ensureLocalObjectDirectory(objectKey: string) {
  await mkdir(path.dirname(getLocalObjectPath(objectKey)), { recursive: true });
}

export function getAnalysisOutputDirectory(videoId: string) {
  if (!/^[\w-]+$/.test(videoId)) {
    throw new Error("Video id invalido para analysis storage.");
  }
  return path.resolve(getAnalysisStorageRoot(), videoId);
}

export function getAnnotatedVideoPath(videoId: string) {
  return path.join(getAnalysisOutputDirectory(videoId), "annotated.mp4");
}

export function getMetricsJsonPath(videoId: string) {
  return path.join(getAnalysisOutputDirectory(videoId), "metrics.json");
}

export function isPathInsideDirectory(root: string, candidatePath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidatePath);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(rootWithSep);
}

export function isManagedLocalUploadPath(candidatePath: string) {
  return isPathInsideDirectory(getLocalStorageRoot(), candidatePath);
}

export function isManagedAnalysisPath(candidatePath: string) {
  return isPathInsideDirectory(getAnalysisStorageRoot(), candidatePath);
}
