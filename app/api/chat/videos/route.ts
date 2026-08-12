import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isRecord } from "@/lib/analysis-metrics";

export async function GET(request: Request) {
  const user = await requireUser();
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
  const videos = await prisma.video.findMany({
    where: {
      ownerId: user.id,
      ...(query ? { originalFilename: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      id: true,
      originalFilename: true,
      status: true,
      playedAt: true,
      createdAt: true,
      metadata: true,
      metricSnapshots: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true } },
    },
  });

  return NextResponse.json({
    videos: videos.map((video) => {
      const metadata = isRecord(video.metadata) ? video.metadata : {};
      const matchInfo = isRecord(metadata.matchInfo) ? metadata.matchInfo : {};
      return {
        id: video.id,
        label: video.originalFilename,
        ownTeam: typeof matchInfo.ownTeam === "string" ? matchInfo.ownTeam : null,
        rivalTeam: typeof matchInfo.rivalTeam === "string" ? matchInfo.rivalTeam : null,
        status: video.status,
        hasMetrics: video.metricSnapshots.length > 0,
        playedAt: (video.playedAt ?? video.createdAt).toISOString(),
      };
    }),
  });
}
