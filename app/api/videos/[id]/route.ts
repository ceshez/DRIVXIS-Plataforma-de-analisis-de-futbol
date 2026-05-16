import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isRecord } from "@/lib/analysis-metrics";
import { getDetectedColorPair, isAllowedDetectedColorSwap } from "@/lib/detected-color-pair";
import {
  getAnalysisOutputDirectory,
  getLocalObjectPath,
  isManagedAnalysisPath,
  isManagedLocalUploadPath,
} from "@/lib/local-storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { deleteStorageObjects, isStorageConfigured } from "@/lib/storage";
import { updateVideoMatchSchema } from "@/lib/validators";
import { serializeVideo } from "@/lib/video-serialization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const [user, { id }] = await Promise.all([requireUser(), context.params]);

  const video = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      originalFilename: true,
      status: true,
      sizeBytes: true,
      durationSeconds: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      objectKey: true,
      analysisJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          progress: true,
          error: true,
          createdAt: true,
          startedAt: true,
          endedAt: true,
        },
      },
      metricSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          jobId: true,
          metrics: true,
          createdAt: true,
        },
      },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ video: serializeVideo(video) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const [user, { id }] = await Promise.all([requireUser(), context.params]);
  const parsed = updateVideoMatchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos de partido inválidos." },
      { status: 400 },
    );
  }

  const existingVideo = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      status: true,
      metadata: true,
      metricSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          metrics: true,
        },
      },
    },
  });

  if (!existingVideo) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  if (existingVideo.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Los colores se configuran cuando el análisis ya termino." },
      { status: 409 },
    );
  }

  const detectedPair = getDetectedColorPair(existingVideo.metricSnapshots[0]?.metrics);
  if (!isAllowedDetectedColorSwap(parsed.data.matchInfo, detectedPair)) {
    return NextResponse.json(
      { error: "Solo se puede guardar el par de colores detectado por el análisis, normal o intercambiado." },
      { status: 409 },
    );
  }

  const metadata = isRecord(existingVideo.metadata) ? existingVideo.metadata : {};
  const currentMatchInfo = isRecord(metadata.matchInfo) ? metadata.matchInfo : {};
  const video = await prisma.video.update({
    where: { id: existingVideo.id },
    data: {
      metadata: {
        ...metadata,
        matchInfo: {
          ...currentMatchInfo,
          ...parsed.data.matchInfo,
        },
      },
    },
    select: {
      id: true,
      originalFilename: true,
      status: true,
      sizeBytes: true,
      durationSeconds: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      objectKey: true,
      analysisJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          progress: true,
          error: true,
          createdAt: true,
          startedAt: true,
          endedAt: true,
        },
      },
      metricSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          jobId: true,
          metrics: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ video: serializeVideo(video) });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const [user, { id }] = await Promise.all([requireUser(), context.params]);

  const video = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      status: true,
      objectKey: true,
      sizeBytes: true,
      metadata: true,
      analysisJobs: {
        where: { status: { in: ["QUEUED", "RUNNING"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  const activeJob = video.analysisJobs[0] ?? null;
  if (activeJob) {
    return NextResponse.json(
      {
        error: "This video is currently being analyzed. Stop or wait for analysis before deleting.",
        code: "VIDEO_ANALYSIS_ACTIVE",
        jobStatus: activeJob.status,
      },
      { status: 409 },
    );
  }

  const metadata = isRecord(video.metadata) ? video.metadata : {};
  const remoteObjectKeys = new Set<string>();
  const addRemoteKey = (value: unknown) => {
    if (typeof value !== "string") return;
    if (!value.startsWith(`users/${user.id}/`)) return;
    remoteObjectKeys.add(value);
  };
  addRemoteKey(video.objectKey);
  addRemoteKey(metadata.processedObjectKey);
  addRemoteKey(metadata.annotatedObjectKey);
  addRemoteKey(metadata.latestMetricsObjectKey);

  if (isStorageConfigured() && remoteObjectKeys.size > 0) {
    const remoteDeletion = await deleteStorageObjects(Array.from(remoteObjectKeys));
    if (remoteDeletion.warnings.length > 0) {
      return NextResponse.json(
        {
          error: "No se pudo eliminar uno o más objetos en Cloudflare R2. El video no se eliminó de la base de datos.",
          warnings: remoteDeletion.warnings,
        },
        { status: 502 },
      );
    }
  }

  const cleanupTargets = new Set<string>();
  try {
    cleanupTargets.add(getLocalObjectPath(video.objectKey));
  } catch {
    // Continue cleanup with managed paths found in metadata.
  }

  const metadataSourcePath = typeof metadata.sourceLocalPath === "string" ? metadata.sourceLocalPath : null;
  if (metadataSourcePath && isManagedLocalUploadPath(metadataSourcePath)) {
    cleanupTargets.add(metadataSourcePath);
  }

  const annotatedPath = typeof metadata.annotatedLocalPath === "string" ? metadata.annotatedLocalPath : null;
  if (annotatedPath && isManagedAnalysisPath(annotatedPath)) {
    cleanupTargets.add(annotatedPath);
  }

  const processedPath = typeof metadata.processedLocalPath === "string" ? metadata.processedLocalPath : null;
  if (processedPath && isManagedAnalysisPath(processedPath)) {
    cleanupTargets.add(processedPath);
  }

  const metricsPath = typeof metadata.latestMetricsPath === "string" ? metadata.latestMetricsPath : null;
  if (metricsPath && isManagedAnalysisPath(metricsPath)) {
    cleanupTargets.add(metricsPath);
  }

  const processedSizeBytes = parseMetadataBigInt(metadata.processedSizeBytes);
  const metricsSizeBytes = parseMetadataBigInt(metadata.metricsSizeBytes);
  const bytesToSubtract = video.sizeBytes + processedSizeBytes + metricsSizeBytes;
  const analysisDirectory = getAnalysisOutputDirectory(video.id);

  await prisma.$transaction(async (tx) => {
    const dbUser = await tx.user.findUnique({
      where: { id: user.id },
      select: { storageUsedBytes: true },
    });
    if (!dbUser) {
      throw new Error("Usuario no encontrado.");
    }

    const nextUsedBytes = dbUser.storageUsedBytes - bytesToSubtract;
    await tx.user.update({
      where: { id: user.id },
      data: {
        storageUsedBytes: nextUsedBytes > 0n ? nextUsedBytes : 0n,
      },
    });

    await tx.video.delete({
      where: { id: video.id },
    });
  });

  const cleanupResults = await Promise.allSettled([
    ...Array.from(cleanupTargets, (targetPath) => rm(targetPath, { force: true })),
    rm(analysisDirectory, { recursive: true, force: true }),
  ]);

  for (const result of cleanupResults) {
    if (result.status === "rejected") {
      console.error(`DRIVXIS video cleanup warning for ${video.id}:`, result.reason);
    }
  }

  return NextResponse.json({ ok: true, deletedId: video.id });
}

function parseMetadataBigInt(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return BigInt(Math.round(value));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}
