export type AnalysisMetrics = {
  version: 1;
  source?: string;
  inference?: {
    detector?: string;
    model: string;
    revision: string;
    generationMode: string;
    format?: string;
    device?: string;
    detectionFps: number;
    batchSize: number;
    analysisSize?: { width: number; height: number };
    framesProcessed: number;
    slowRetries: number;
    parseFailures: number;
    invalidBoxes?: number;
    unknownLabels?: number;
  };
  match?: {
    ownTeam: string;
    rivalTeam: string;
    ownTeamColor?: string | null;
    rivalTeamColor?: string | null;
    ownGoals?: number;
    rivalGoals?: number;
    detectedTeamColors?: {
      team1?: string;
      team2?: string;
      confidence?: number;
      sampleCount?: number;
      tentative?: boolean;
    };
  };
  possession: {
    team1Pct: number;
    team2Pct: number;
    unknownPct?: number;
  };
  ballControl?: {
    ownTeam: number;
    rivalTeam: number;
    unknown?: number;
  };
  speed: {
    maxKmh: number;
    avgKmh: number;
    rawMaxKmh?: number;
    publishable?: boolean;
    note?: string;
    validSamples: number;
    rejectedSamples: number;
    rejectionReasons: Record<string, number>;
    calibrationStatus?: string;
    confidence?: number;
    untrustedPlayers?: Array<{
      id: string | number;
      reason: string;
      validSamples?: number;
    }>;
    players: Array<{
      id: string | number;
      team?: 1 | 2 | null;
      maxKmh: number;
      rawMaxKmh?: number;
      avgKmh?: number;
      distanceMeters?: number;
      validSamples?: number;
      trusted?: boolean;
      untrustedReason?: string | null;
    }>;
  };
  distance: {
    totalMeters: number;
    teams?: {
      own: {
        name: string;
        totalMeters: number;
        totalKm: number;
      };
      rival: {
        name: string;
        totalMeters: number;
        totalKm: number;
      };
    };
  };
  teamDistances?: {
    ownTeam: number;
    rivalTeam: number;
  };
  players?: {
    detected: number;
  };
  quality?: {
    speed?: {
      confidence?: number;
      untrustedPlayers?: Array<{
        id: string | number;
        reason: string;
        validSamples?: number;
      }>;
      calibrationConfidence?: number;
    };
    tracking?: Record<string, unknown>;
    goalkeepers?: {
      detected?: number;
      assigned?: number;
      items?: Array<{
        id: string | number;
        team?: 1 | 2 | null;
        teamConfidence?: number;
        reason?: string;
        frames?: number;
      }>;
    };
    ball?: Record<string, unknown>;
    possession?: Record<string, unknown>;
    teamColors?: {
      confidence?: number;
      sampleCount?: number;
      tentative?: boolean;
    };
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

function mapRecords<T>(value: unknown, mapper: (record: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const item of value) {
    if (isRecord(item)) result.push(mapper(item));
  }
  return result;
}

export function parseAnalysisMetrics(value: unknown): AnalysisMetrics | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!isRecord(value.possession) || !isRecord(value.speed) || !isRecord(value.distance) || !isRecord(value.video)) {
    return null;
  }

  const players = mapRecords(value.speed.players, (player) => {
        const team: 1 | 2 | null = player.team === 1 ? 1 : player.team === 2 ? 2 : null;
        return {
          id: typeof player.id === "string" || typeof player.id === "number" ? player.id : "sin-id",
          team,
          maxKmh: finiteNumber(player.maxKmh),
          rawMaxKmh: finiteNumber(player.rawMaxKmh, finiteNumber(player.maxKmh)),
          avgKmh: finiteNumber(player.avgKmh),
          distanceMeters: finiteNumber(player.distanceMeters),
          validSamples: finiteNumber(player.validSamples),
          trusted: typeof player.trusted === "boolean" ? player.trusted : undefined,
          untrustedReason: typeof player.untrustedReason === "string" ? player.untrustedReason : null,
        };
  });

  const rejectionReasons = isRecord(value.speed.rejectionReasons)
    ? Object.fromEntries(
        Object.entries(value.speed.rejectionReasons).map(([key, count]) => [key, finiteNumber(count)]),
      )
    : {};

  const untrustedPlayers = mapRecords(value.speed.untrustedPlayers, (player) => ({
        id: typeof player.id === "string" || typeof player.id === "number" ? player.id : "sin-id",
        reason: typeof player.reason === "string" ? player.reason : "low_confidence",
        validSamples: finiteNumber(player.validSamples),
  }));

  return {
    version: 1,
    source: typeof value.source === "string" ? value.source : undefined,
    inference: isRecord(value.inference)
      ? {
          detector: typeof value.inference.detector === "string" ? value.inference.detector : undefined,
          model: typeof value.inference.model === "string" ? value.inference.model : "unknown",
          revision: typeof value.inference.revision === "string" ? value.inference.revision : "unknown",
          generationMode:
            typeof value.inference.generationMode === "string" ? value.inference.generationMode : "unknown",
          format: typeof value.inference.format === "string" ? value.inference.format : undefined,
          device: typeof value.inference.device === "string" ? value.inference.device : undefined,
          detectionFps: finiteNumber(value.inference.detectionFps),
          batchSize: finiteNumber(value.inference.batchSize),
          analysisSize: isRecord(value.inference.analysisSize)
            ? {
                width: finiteNumber(value.inference.analysisSize.width),
                height: finiteNumber(value.inference.analysisSize.height),
              }
            : undefined,
          framesProcessed: finiteNumber(value.inference.framesProcessed),
          slowRetries: finiteNumber(value.inference.slowRetries),
          parseFailures: finiteNumber(value.inference.parseFailures),
          invalidBoxes: finiteNumber(value.inference.invalidBoxes),
          unknownLabels: finiteNumber(value.inference.unknownLabels),
        }
      : undefined,
    match: isRecord(value.match)
      ? {
          ownTeam: typeof value.match.ownTeam === "string" ? value.match.ownTeam : "Equipo 1",
          rivalTeam: typeof value.match.rivalTeam === "string" ? value.match.rivalTeam : "Equipo 2",
          ownTeamColor: typeof value.match.ownTeamColor === "string" ? value.match.ownTeamColor : null,
          rivalTeamColor: typeof value.match.rivalTeamColor === "string" ? value.match.rivalTeamColor : null,
          ownGoals: finiteNumber(value.match.ownGoals),
          rivalGoals: finiteNumber(value.match.rivalGoals),
          detectedTeamColors: isRecord(value.match.detectedTeamColors)
            ? {
                team1: typeof value.match.detectedTeamColors.team1 === "string" ? value.match.detectedTeamColors.team1 : undefined,
                team2: typeof value.match.detectedTeamColors.team2 === "string" ? value.match.detectedTeamColors.team2 : undefined,
                confidence: finiteNumber(value.match.detectedTeamColors.confidence),
                sampleCount: finiteNumber(value.match.detectedTeamColors.sampleCount),
                tentative:
                  typeof value.match.detectedTeamColors.tentative === "boolean"
                    ? value.match.detectedTeamColors.tentative
                    : undefined,
              }
            : undefined,
        }
      : undefined,
    possession: {
      team1Pct: finiteNumber(value.possession.team1Pct),
      team2Pct: finiteNumber(value.possession.team2Pct),
      unknownPct: finiteNumber(value.possession.unknownPct),
    },
    ballControl: isRecord(value.ballControl)
      ? {
          ownTeam: finiteNumber(value.ballControl.ownTeam),
          rivalTeam: finiteNumber(value.ballControl.rivalTeam),
          unknown: finiteNumber(value.ballControl.unknown),
        }
      : undefined,
    speed: {
      maxKmh: finiteNumber(value.speed.maxKmh),
      avgKmh: finiteNumber(value.speed.avgKmh),
      rawMaxKmh: finiteNumber(value.speed.rawMaxKmh, finiteNumber(value.speed.maxKmh)),
      publishable: typeof value.speed.publishable === "boolean" ? value.speed.publishable : undefined,
      note: typeof value.speed.note === "string" ? value.speed.note : undefined,
      validSamples: finiteNumber(value.speed.validSamples),
      rejectedSamples: finiteNumber(value.speed.rejectedSamples),
      rejectionReasons,
      calibrationStatus: typeof value.speed.calibrationStatus === "string" ? value.speed.calibrationStatus : undefined,
      confidence: finiteNumber(value.speed.confidence),
      untrustedPlayers,
      players,
    },
    distance: {
      totalMeters: finiteNumber(value.distance.totalMeters),
      teams: isRecord(value.distance.teams)
        ? {
            own: parseTeamDistance(value.distance.teams.own, "Equipo 1"),
            rival: parseTeamDistance(value.distance.teams.rival, "Equipo 2"),
          }
        : undefined,
    },
    teamDistances: isRecord(value.teamDistances)
      ? {
          ownTeam: finiteNumber(value.teamDistances.ownTeam),
          rivalTeam: finiteNumber(value.teamDistances.rivalTeam),
        }
      : undefined,
    players: isRecord(value.players)
      ? {
          detected: finiteNumber(value.players.detected),
        }
      : undefined,
    quality: isRecord(value.quality)
      ? {
          speed: isRecord(value.quality.speed)
            ? {
                confidence: finiteNumber(value.quality.speed.confidence),
                untrustedPlayers,
                calibrationConfidence: finiteNumber(value.quality.speed.calibrationConfidence),
              }
            : undefined,
          tracking: isRecord(value.quality.tracking) ? value.quality.tracking : undefined,
          goalkeepers: isRecord(value.quality.goalkeepers)
            ? {
                detected: finiteNumber(value.quality.goalkeepers.detected),
                assigned: finiteNumber(value.quality.goalkeepers.assigned),
                items: mapRecords(value.quality.goalkeepers.items, (item) => ({
                      id: typeof item.id === "string" || typeof item.id === "number" ? item.id : "sin-id",
                      team: item.team === 1 ? 1 : item.team === 2 ? 2 : null,
                      teamConfidence: finiteNumber(item.teamConfidence),
                      reason: typeof item.reason === "string" ? item.reason : undefined,
                      frames: finiteNumber(item.frames),
                })),
              }
            : undefined,
          ball: isRecord(value.quality.ball) ? value.quality.ball : undefined,
          possession: isRecord(value.quality.possession) ? value.quality.possession : undefined,
          teamColors: isRecord(value.quality.teamColors)
            ? {
                confidence: finiteNumber(value.quality.teamColors.confidence),
                sampleCount: finiteNumber(value.quality.teamColors.sampleCount),
                tentative: typeof value.quality.teamColors.tentative === "boolean" ? value.quality.teamColors.tentative : undefined,
              }
            : undefined,
        }
      : undefined,
    video: {
      frameCount: finiteNumber(value.video.frameCount),
      fps: finiteNumber(value.video.fps),
      durationSeconds: finiteNumber(value.video.durationSeconds),
      annotatedAvailable: Boolean(value.video.annotatedAvailable),
    },
  };
}

function parseTeamDistance(value: unknown, fallbackName: string) {
  return isRecord(value)
    ? {
        name: typeof value.name === "string" ? value.name : fallbackName,
        totalMeters: finiteNumber(value.totalMeters),
        totalKm: finiteNumber(value.totalKm),
      }
    : {
        name: fallbackName,
        totalMeters: 0,
        totalKm: 0,
      };
}
