export type AnalysisMetrics = {
  version: 1;
  source?: string;
  possession: {
    team1Pct: number;
    team2Pct: number;
    unknownPct?: number;
  };
  speed: {
    maxKmh: number;
    avgKmh: number;
    validSamples: number;
    rejectedSamples: number;
    rejectionReasons: Record<string, number>;
    calibrationStatus?: string;
    players: Array<{
      id: string | number;
      team?: 1 | 2 | null;
      maxKmh: number;
      avgKmh?: number;
      distanceMeters?: number;
      validSamples?: number;
    }>;
  };
  distance: {
    totalMeters: number;
  };
  video: {
    frameCount: number;
    fps: number;
    durationSeconds?: number;
    annotatedAvailable: boolean;
  };
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function parseAnalysisMetrics(value: unknown): AnalysisMetrics | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!isRecord(value.possession) || !isRecord(value.speed) || !isRecord(value.distance) || !isRecord(value.video)) {
    return null;
  }

  const players = Array.isArray(value.speed.players)
    ? value.speed.players.filter(isRecord).map((player) => {
        const team: 1 | 2 | null = player.team === 1 ? 1 : player.team === 2 ? 2 : null;
        return {
          id: typeof player.id === "string" || typeof player.id === "number" ? player.id : "sin-id",
          team,
          maxKmh: finiteNumber(player.maxKmh),
          avgKmh: finiteNumber(player.avgKmh),
          distanceMeters: finiteNumber(player.distanceMeters),
          validSamples: finiteNumber(player.validSamples),
        };
      })
    : [];

  const rejectionReasons = isRecord(value.speed.rejectionReasons)
    ? Object.fromEntries(
        Object.entries(value.speed.rejectionReasons).map(([key, count]) => [key, finiteNumber(count)]),
      )
    : {};

  return {
    version: 1,
    source: typeof value.source === "string" ? value.source : undefined,
    possession: {
      team1Pct: finiteNumber(value.possession.team1Pct),
      team2Pct: finiteNumber(value.possession.team2Pct),
      unknownPct: finiteNumber(value.possession.unknownPct),
    },
    speed: {
      maxKmh: finiteNumber(value.speed.maxKmh),
      avgKmh: finiteNumber(value.speed.avgKmh),
      validSamples: finiteNumber(value.speed.validSamples),
      rejectedSamples: finiteNumber(value.speed.rejectedSamples),
      rejectionReasons,
      calibrationStatus: typeof value.speed.calibrationStatus === "string" ? value.speed.calibrationStatus : undefined,
      players,
    },
    distance: {
      totalMeters: finiteNumber(value.distance.totalMeters),
    },
    video: {
      frameCount: finiteNumber(value.video.frameCount),
      fps: finiteNumber(value.video.fps),
      durationSeconds: finiteNumber(value.video.durationSeconds),
      annotatedAvailable: Boolean(value.video.annotatedAvailable),
    },
  };
}

export function getMetricDisplay(metrics: AnalysisMetrics | null) {
  const possession = metrics?.possession.team1Pct ?? 0;
  const distanceKm = (metrics?.distance.totalMeters ?? 0) / 1000;

  return {
    possession: possession.toFixed(1),
    maxSpeed: (metrics?.speed.maxKmh ?? 0).toFixed(1),
    avgSpeed: (metrics?.speed.avgKmh ?? 0).toFixed(1),
    distanceKm: distanceKm.toFixed(distanceKm >= 10 ? 1 : 2),
    frameCount: String(metrics?.video.frameCount ?? 0),
  };
}
