import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await requireUser();

  const { searchParams } = new URL(request.url);
  const staleMinutes = clampMinutes(searchParams.get("runningOlderThanMinutes"));
  const staleThreshold = new Date(Date.now() - staleMinutes * 60_000);

  const [videosCount, jobsCount, runningJobsOlderCount, videosMissingObjectKey, orphanJobsRows, videosMissingMetadataRows] =
    await Promise.all([
      prisma.video.count(),
      prisma.analysisJob.count(),
      prisma.analysisJob.count({
        where: {
          status: "RUNNING",
          startedAt: { lt: staleThreshold },
        },
      }),
      prisma.video.count({
        where: {
          OR: [{ objectKey: "" }, { objectKey: { startsWith: " " } }],
        },
      }),
      prisma.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "AnalysisJob" j
        LEFT JOIN "Video" v ON v."id" = j."videoId"
        WHERE v."id" IS NULL
      `,
      prisma.$queryRaw<Array<{ count: bigint | number }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Video"
        WHERE "metadata" IS NULL OR "metadata" = '{}'::jsonb
      `,
    ]);

  const orphanJobsCount = Number(orphanJobsRows[0]?.count ?? 0);
  const videosMissingMetadata = Number(videosMissingMetadataRows[0]?.count ?? 0);

  return NextResponse.json({
    environment: process.env.NODE_ENV || "development",
    staleRunningThresholdMinutes: staleMinutes,
    counts: {
      videos: videosCount,
      jobs: jobsCount,
      jobsWithoutVideo: orphanJobsCount,
      runningJobsOlderThanThreshold: runningJobsOlderCount,
      videosWithMissingMetadata: videosMissingMetadata,
      videosWithMissingObjectKey: videosMissingObjectKey,
    },
  });
}

function clampMinutes(raw: string | null) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 30;
  return Math.max(1, Math.min(24 * 60, Math.round(parsed)));
}
