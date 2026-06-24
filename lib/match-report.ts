import { type AnalysisMetrics, isRecord } from "@/lib/analysis-metrics";

type MatchInfo = {
  ownTeam?: string;
  rivalTeam?: string;
  ownTeamColor?: string;
  rivalTeamColor?: string;
};

type BuildMatchReportOptions = {
  metrics: AnalysisMetrics;
  originalFilename: string;
  matchInfo?: unknown;
  generatedAt?: Date;
};

export type MatchReportData = {
  originalFilename: string;
  ownTeam: string;
  rivalTeam: string;
  generatedAt: Date;
  durationSeconds: number;
  statTeams: { primary: string; secondary: string };
  teamMapping: { confirmed: boolean; message: string };
  possession: { primary: number; secondary: number; unknown: number };
  distanceKm: { primary: number; secondary: number; total: number };
  detectedPlayers: number;
  speed: { maxKmh: number; avgKmh: number } | null;
  coverage: {
    frameCount: number;
    fps: number;
    ballDetectionPct: number | null;
    possessionAssignedFrames: number | null;
    possessionUnknownFrames: number | null;
    possessionCoveragePct: number | null;
    goalkeepersDetected: number | null;
    goalkeepersAssigned: number | null;
    teamColorConfidencePct: number | null;
  };
  insights: string[];
};

export function createMatchReportData({
  metrics,
  originalFilename,
  matchInfo,
  generatedAt = new Date(),
}: BuildMatchReportOptions) {
  const configuredMatch = parseMatchInfo(matchInfo);
  const ownTeam = configuredMatch.ownTeam ?? metrics.match?.ownTeam ?? "Equipo 1";
  const rivalTeam = configuredMatch.rivalTeam ?? metrics.match?.rivalTeam ?? "Equipo 2";
  const mapping = resolveTeamMapping(configuredMatch, metrics, ownTeam, rivalTeam);
  const rawTeamOnePossession = metrics.possession.team1Pct;
  const rawTeamTwoPossession = metrics.possession.team2Pct;
  const rawTeamOneDistanceKm = metrics.distance.teams?.own.totalKm ?? (metrics.teamDistances?.ownTeam ?? 0) / 1000;
  const rawTeamTwoDistanceKm = metrics.distance.teams?.rival.totalKm ?? (metrics.teamDistances?.rivalTeam ?? 0) / 1000;
  const primaryPossession = mapping.swapped ? rawTeamTwoPossession : rawTeamOnePossession;
  const secondaryPossession = mapping.swapped ? rawTeamOnePossession : rawTeamTwoPossession;
  const primaryDistanceKm = mapping.swapped ? rawTeamTwoDistanceKm : rawTeamOneDistanceKm;
  const secondaryDistanceKm = mapping.swapped ? rawTeamOneDistanceKm : rawTeamTwoDistanceKm;
  const detectedPlayers = metrics.players?.detected ?? metrics.speed.players.length;
  const durationSeconds = metrics.video.durationSeconds ?? 0;
  const possessionQuality = metrics.quality?.possession;
  const directAssignments = getRecordNumber(possessionQuality, "directAssignments");
  const carriedAssignments = getRecordNumber(possessionQuality, "carriedAssignments");
  const unknownFrames = getRecordNumber(possessionQuality, "unknownFrames");
  const assignedFrames = directAssignments === null && carriedAssignments === null ? null : (directAssignments ?? 0) + (carriedAssignments ?? 0);
  const possessionCoveragePct = assignedFrames === null || unknownFrames === null
    ? null
    : toPercent(assignedFrames / Math.max(1, assignedFrames + unknownFrames));
  const ballDetectionPct = toOptionalPercent(getRecordNumber(metrics.quality?.ball, "confidence"));
  const teamColorConfidencePct = toOptionalPercent(metrics.quality?.teamColors?.confidence ?? metrics.match?.detectedTeamColors?.confidence);

  const speed = metrics.speed.publishable
    ? { maxKmh: metrics.speed.maxKmh, avgKmh: metrics.speed.avgKmh }
    : null;

  return {
    originalFilename,
    ownTeam,
    rivalTeam,
    generatedAt,
    durationSeconds,
    statTeams: { primary: mapping.primaryLabel, secondary: mapping.secondaryLabel },
    teamMapping: { confirmed: mapping.confirmed, message: mapping.message },
    possession: { primary: primaryPossession, secondary: secondaryPossession, unknown: metrics.possession.unknownPct ?? 0 },
    distanceKm: { primary: primaryDistanceKm, secondary: secondaryDistanceKm, total: metrics.distance.totalMeters / 1000 },
    detectedPlayers: Math.max(0, Math.round(detectedPlayers)),
    speed,
    coverage: {
      frameCount: metrics.video.frameCount,
      fps: metrics.video.fps,
      ballDetectionPct,
      possessionAssignedFrames: assignedFrames,
      possessionUnknownFrames: unknownFrames,
      possessionCoveragePct,
      goalkeepersDetected: metrics.quality?.goalkeepers?.detected ?? null,
      goalkeepersAssigned: metrics.quality?.goalkeepers?.assigned ?? null,
      teamColorConfidencePct,
    },
    insights: [
      ...(!mapping.confirmed ? [mapping.message] : []),
      describeAdvantage("control del balón", mapping.primaryLabel, mapping.secondaryLabel, primaryPossession, secondaryPossession, "%"),
      describeAdvantage("distancia recorrida", mapping.primaryLabel, mapping.secondaryLabel, primaryDistanceKm, secondaryDistanceKm, " km"),
    ],
  };
}

export function buildMatchReport(options: BuildMatchReportOptions) {
  const report = createMatchReportData(options);
  const speedLine = report.speed
    ? `- Velocidad máxima registrada: ${formatNumber(report.speed.maxKmh)} km/h.\n- Velocidad media registrada: ${formatNumber(report.speed.avgKmh)} km/h.`
    : "- Velocidad: no se incluye porque la calibración no alcanzó la confianza necesaria.";

  return [
    "REPORTE DE ANÁLISIS DEL PARTIDO",
    "=".repeat(31),
    "",
    `Archivo analizado: ${report.originalFilename}`,
    `Partido: ${report.ownTeam} vs ${report.rivalTeam}`,
    `Generado: ${formatDate(report.generatedAt)}`,
    report.durationSeconds > 0 ? `Duración analizada: ${formatDuration(report.durationSeconds)}` : null,
    "",
    "DATOS PRINCIPALES",
    "---------------",
    `- Posesión/control del balón: ${report.statTeams.primary} ${formatNumber(report.possession.primary)}% · ${report.statTeams.secondary} ${formatNumber(report.possession.secondary)}%.`,
    `- Distancia recorrida: ${report.statTeams.primary} ${formatNumber(report.distanceKm.primary)} km · ${report.statTeams.secondary} ${formatNumber(report.distanceKm.secondary)} km.`,
    `- Jugadores detectados: ${report.detectedPlayers}.`,
    speedLine,
    "",
    "LECTURA DEL PARTIDO",
    "-------------------",
    ...report.insights,
    "",
    "Nota: las métricas se obtienen automáticamente a partir del video analizado y pueden variar según la calidad de imagen, la calibración de la cancha y el seguimiento detectado.",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function createMatchReportFilename(originalFilename: string, extension = "txt") {
  const baseName = originalFilename
    .replace(/\.[^.]+$/, "")
    .replace(/[\\/:*?\"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return `${baseName || "partido"}-reporte-de-analisis.${extension}`;
}

function parseMatchInfo(value: unknown): MatchInfo {
  if (!isRecord(value)) return {};
  return {
    ownTeam: typeof value.ownTeam === "string" && value.ownTeam.trim() ? value.ownTeam.trim() : undefined,
    rivalTeam: typeof value.rivalTeam === "string" && value.rivalTeam.trim() ? value.rivalTeam.trim() : undefined,
    ownTeamColor: normalizeHex(value.ownTeamColor),
    rivalTeamColor: normalizeHex(value.rivalTeamColor),
  };
}

function resolveTeamMapping(matchInfo: MatchInfo, metrics: AnalysisMetrics, ownTeam: string, rivalTeam: string) {
  const detectedOwn = normalizeHex(metrics.match?.detectedTeamColors?.team1);
  const detectedRival = normalizeHex(metrics.match?.detectedTeamColors?.team2);
  const normal = Boolean(
    matchInfo.ownTeamColor &&
      matchInfo.rivalTeamColor &&
      detectedOwn &&
      detectedRival &&
      matchInfo.ownTeamColor === detectedOwn &&
      matchInfo.rivalTeamColor === detectedRival,
  );
  const swapped = Boolean(
    matchInfo.ownTeamColor &&
      matchInfo.rivalTeamColor &&
      detectedOwn &&
      detectedRival &&
      matchInfo.ownTeamColor === detectedRival &&
      matchInfo.rivalTeamColor === detectedOwn,
  );

  if (normal || swapped) {
    return {
      confirmed: true,
      swapped,
      primaryLabel: ownTeam,
      secondaryLabel: rivalTeam,
      message: "La asociación entre equipos y colores detectados está confirmada.",
    };
  }

  return {
    confirmed: false,
    swapped: false,
    primaryLabel: "Equipo detectado 1",
    secondaryLabel: "Equipo detectado 2",
    message: "La asociación entre los clubes y los colores detectados aún no está confirmada. Las métricas se muestran por equipo detectado para no atribuir datos al club equivocado.",
  };
}

function getRecordNumber(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toOptionalPercent(value: number | undefined | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return toPercent(value);
}

function toPercent(value: number) {
  return Math.max(0, Math.min(100, value * 100));
}

function normalizeHex(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : undefined;
}

function describeAdvantage(metric: string, ownTeam: string, rivalTeam: string, ownValue: number, rivalValue: number, unit: string) {
  const difference = ownValue - rivalValue;
  const threshold = unit === "%" ? 3 : 0.2;
  if (Math.abs(difference) < threshold) {
    return `- El ${metric} fue equilibrado entre ambos equipos.`;
  }

  const leadingTeam = difference > 0 ? ownTeam : rivalTeam;
  return `- ${leadingTeam} tuvo mayor ${metric} por ${formatNumber(Math.abs(difference))}${unit}.`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-CR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    Number.isFinite(value) ? value : 0,
  );
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("es-CR", { dateStyle: "long", timeStyle: "short" }).format(value);
}

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes} min ${remainingSeconds.toString().padStart(2, "0")} s`;
}
