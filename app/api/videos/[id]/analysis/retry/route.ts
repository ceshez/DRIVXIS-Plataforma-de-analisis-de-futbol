import { NextResponse } from "next/server";
import { kickAnalysisWorker } from "@/lib/analysis-worker";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeVideo } from "@/lib/video-serialization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireUser();
  const { id } = await context.params;

  const video = await prisma.video.findFirst({
    where: { id, ownerId: user.id },
    select: { id: true },
  });

  if (!video) {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  const updated = await prisma.video.update({
    where: { id },
    data: {
      status: "PENDING_ANALYSIS",
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
  return NextResponse.json({ video: serializeVideo(updated) });
}
