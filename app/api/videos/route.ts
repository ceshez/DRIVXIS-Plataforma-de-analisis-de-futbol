import { NextResponse } from "next/server";
import { kickAnalysisWorker } from "@/lib/analysis-worker";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getLocalObjectPath } from "@/lib/local-storage";
import { createVideoSchema } from "@/lib/validators";
import { serializeVideo, serializeVideos } from "@/lib/video-serialization";

export const runtime = "nodejs";

export async function GET() {
  const user = await requireUser();
  const videos = await prisma.video.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
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

  return NextResponse.json({ videos: serializeVideos(videos) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = createVideoSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Metadata de video invalida." },
      { status: 400 },
    );
  }

  if (!parsed.data.objectKey.startsWith(`users/${user.id}/videos/`)) {
    return NextResponse.json({ error: "La llave de storage no pertenece al usuario actual." }, { status: 403 });
  }

  const uploadMode = parsed.data.uploadMode || "local";
  const sourceLocalPath = uploadMode === "local" ? getLocalObjectPath(parsed.data.objectKey) : null;
  const matchInfo = parsed.data.matchInfo ?? null;
  const video = await prisma.video.create({
    data: {
      ownerId: user.id,
      objectKey: parsed.data.objectKey,
      originalFilename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      durationSeconds: parsed.data.durationSeconds,
      status: "PENDING_ANALYSIS",
      metadata: {
        source: "web-upload",
        storageMode: uploadMode,
        sourceLocalPath,
        processedLocalPath: null,
        annotatedLocalPath: null,
        modelReady: true,
        matchInfo,
      },
      analysisJobs: {
        create: {
          status: "QUEUED",
          progress: 0,
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

  kickAnalysisWorker();
  return NextResponse.json({ video: serializeVideo(video) }, { status: 201 });
}
