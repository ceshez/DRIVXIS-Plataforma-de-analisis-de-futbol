import { rm } from "node:fs/promises";
import { NextResponse } from "next/server";
import { isRecord } from "@/lib/analysis-metrics";
import {
  getAnalysisOutputDirectory,
  getLocalObjectPath,
  isManagedAnalysisPath,
  isManagedLocalUploadPath,
} from "@/lib/local-storage";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { updateVideoMatchSchema } from "@/lib/validators";
import { serializeVideo } from "@/lib/video-serialization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { id } = await context.params;

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
  const user = await requireUser();
  const { id } = await context.params;
  const parsed = updateVideoMatchSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Datos de partido invalidos." },
      { status: 400 },
    );
  }

  const existingVideo = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      status: true,
      metadata: true,
    },
  });

  if (!existingVideo) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  if (existingVideo.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Los colores se configuran cuando el analisis ya termino." },
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
  const user = await requireUser();
  const { id } = await context.params;

  const video = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: {
      id: true,
      objectKey: true,
      metadata: true,
    },
  });

  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  const metadata = isRecord(video.metadata) ? video.metadata : {};
  const cleanupTargets = new Set<string>();
  const sourcePath = getLocalObjectPath(video.objectKey);
  cleanupTargets.add(sourcePath);

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

  const analysisDirectory = getAnalysisOutputDirectory(video.id);

  await prisma.video.delete({
    where: { id: video.id },
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
