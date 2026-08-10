import { NextResponse } from "next/server";
import { ANALYSIS_CANCELLED_BY_USER } from "@/lib/analysis-cancellation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeVideo } from "@/lib/video-serialization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function POST(_request: Request, context: RouteContext) {
  const [user, { id }] = await Promise.all([requireUser(), context.params]);

  const result = await prisma.$transaction(async (tx) => {
    const video = await tx.video.findFirst({
      where: { id, ownerId: user.id },
      select: { id: true },
    });

    if (!video) return { kind: "not-found" as const };

    const cancelledAt = new Date();
    const cancelled = await tx.analysisJob.updateMany({
      where: {
        videoId: video.id,
        status: { in: ["QUEUED", "RUNNING"] },
      },
      data: {
        status: "FAILED",
        error: ANALYSIS_CANCELLED_BY_USER,
        endedAt: cancelledAt,
      },
    });

    if (cancelled.count === 0) return { kind: "not-active" as const };

    const updated = await tx.video.update({
      where: { id: video.id },
      data: { status: "UPLOADED" },
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

    return { kind: "cancelled" as const, video: updated };
  });

  if (result.kind === "not-found") {
    return NextResponse.json({ error: "Video no encontrado." }, { status: 404 });
  }

  if (result.kind === "not-active") {
    return NextResponse.json(
      {
        error: "El video no tiene un análisis activo para cancelar.",
        code: "ANALYSIS_NOT_ACTIVE",
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ video: serializeVideo(result.video) });
}
