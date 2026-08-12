import { prisma } from "@/lib/prisma";
import { createMatchReportData } from "@/lib/match-report";
import { isRecord, parseAnalysisMetrics } from "@/lib/analysis-metrics";
import { getRequestedRecentMatchCount } from "@/lib/chatbot";

type MatchContextItem = {
  id: string;
  source: string;
  playedAt: string;
  competition: string | null;
  ownTeam: string;
  rivalTeam: string;
  analysisAvailable: boolean;
  mappingConfirmed: boolean | null;
  possession: { ownPct: number; rivalPct: number; unknownPct: number } | null;
  distanceKm: { own: number; rival: number; total: number } | null;
  speedKmh: { maximum: number; average: number } | null;
  speedUnavailableReason: string | null;
  detectedPlayers: number | null;
};

export type ChatDataContext = {
  requestedCount: number;
  selection: "explicit" | "recent";
  matches: MatchContextItem[];
  aggregate: {
    matchesWithPossession: number;
    averageOwnPossessionPct: number | null;
    averageRivalPossessionPct: number | null;
    bestOwnPossession: { videoId: string; source: string; value: number } | null;
    worstOwnPossession: { videoId: string; source: string; value: number } | null;
  };
  unavailableMetrics: string[];
};

export async function buildChatDataContext({
  userId,
  content,
  explicitVideoIds,
}: {
  userId: string;
  content: string;
  explicitVideoIds: string[];
}): Promise<ChatDataContext> {
  const requestedCount = getRequestedRecentMatchCount(content);
  const videos = await prisma.video.findMany({
    where: {
      ownerId: userId,
      ...(explicitVideoIds.length > 0 ? { id: { in: explicitVideoIds } } : {}),
    },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    take: explicitVideoIds.length > 0 ? Math.min(explicitVideoIds.length, 12) : requestedCount,
    select: {
      id: true,
      originalFilename: true,
      createdAt: true,
      playedAt: true,
      competition: true,
      metadata: true,
      metricSnapshots: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { metrics: true, createdAt: true },
      },
    },
  });

  const byId = new Map(videos.map((video) => [video.id, video]));
  const orderedVideos = explicitVideoIds.length > 0
    ? explicitVideoIds.map((id) => byId.get(id)).filter((video): video is NonNullable<typeof video> => Boolean(video))
    : videos;

  const matches: MatchContextItem[] = orderedVideos.map((video) => {
    const metrics = parseAnalysisMetrics(video.metricSnapshots[0]?.metrics);
    const metadata = isRecord(video.metadata) ? video.metadata : {};
    const matchInfo = isRecord(metadata.matchInfo) ? metadata.matchInfo : undefined;
    if (!metrics) {
      return {
        id: video.id,
        source: video.originalFilename,
        playedAt: (video.playedAt ?? video.createdAt).toISOString(),
        competition: video.competition,
        ownTeam: typeof matchInfo?.ownTeam === "string" ? matchInfo.ownTeam : "Equipo propio",
        rivalTeam: typeof matchInfo?.rivalTeam === "string" ? matchInfo.rivalTeam : "Rival",
        analysisAvailable: false,
        mappingConfirmed: null,
        possession: null,
        distanceKm: null,
        speedKmh: null,
        speedUnavailableReason: "No existe un snapshot de métricas compatible para este partido.",
        detectedPlayers: null,
      };
    }

    const report = createMatchReportData({
      metrics,
      originalFilename: video.originalFilename,
      matchInfo,
      generatedAt: video.metricSnapshots[0]?.createdAt,
    });
    return {
      id: video.id,
      source: video.originalFilename,
      playedAt: (video.playedAt ?? video.createdAt).toISOString(),
      competition: video.competition,
      ownTeam: report.ownTeam,
      rivalTeam: report.rivalTeam,
      analysisAvailable: true,
      mappingConfirmed: report.teamMapping.confirmed,
      possession: {
        ownPct: report.possession.primary,
        rivalPct: report.possession.secondary,
        unknownPct: report.possession.unknown,
      },
      distanceKm: {
        own: report.distanceKm.primary,
        rival: report.distanceKm.secondary,
        total: report.distanceKm.total,
      },
      speedKmh: report.speed ? { maximum: report.speed.maxKmh, average: report.speed.avgKmh } : null,
      speedUnavailableReason: report.speed ? null : metrics.speed.note || "La calibración física no está marcada como publicable.",
      detectedPlayers: report.detectedPlayers,
    };
  });

  const possessionRows = matches.filter((match): match is MatchContextItem & { possession: NonNullable<MatchContextItem["possession"]> } => Boolean(match.possession));
  const average = (values: number[]) => values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  const sorted = [...possessionRows].sort((a, b) => b.possession.ownPct - a.possession.ownPct);

  return {
    requestedCount,
    selection: explicitVideoIds.length > 0 ? "explicit" : "recent",
    matches,
    aggregate: {
      matchesWithPossession: possessionRows.length,
      averageOwnPossessionPct: average(possessionRows.map((match) => match.possession.ownPct)),
      averageRivalPossessionPct: average(possessionRows.map((match) => match.possession.rivalPct)),
      bestOwnPossession: sorted[0]
        ? { videoId: sorted[0].id, source: sorted[0].source, value: sorted[0].possession.ownPct }
        : null,
      worstOwnPossession: sorted.at(-1)
        ? { videoId: sorted.at(-1)!.id, source: sorted.at(-1)!.source, value: sorted.at(-1)!.possession.ownPct }
        : null,
    },
    unavailableMetrics: [
      "presión: el pipeline actual no publica una métrica validada de presión",
      ...(matches.some((match) => !match.speedKmh) ? ["velocidad de los partidos cuya calibración no es publicable"] : []),
    ],
  };
}

export function formatChatDataContext(context: ChatDataContext) {
  return JSON.stringify(context, null, 2);
}
