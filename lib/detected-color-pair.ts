import { isRecord } from "@/lib/analysis-metrics";

export type DetectedColorPair = {
  team1: string;
  team2: string;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export function getDetectedColorPair(metrics: unknown): DetectedColorPair | null {
  if (!isRecord(metrics) || !isRecord(metrics.match) || !isRecord(metrics.match.detectedTeamColors)) {
    return null;
  }

  const team1 = normalizeHex(metrics.match.detectedTeamColors.team1);
  const team2 = normalizeHex(metrics.match.detectedTeamColors.team2);
  if (!team1 || !team2 || team1 === team2) return null;
  return { team1, team2 };
}

export function isAllowedDetectedColorSwap(
  requested: { ownTeamColor: string; rivalTeamColor: string },
  detected: DetectedColorPair | null,
) {
  if (!detected) return false;
  const ownTeamColor = normalizeHex(requested.ownTeamColor);
  const rivalTeamColor = normalizeHex(requested.rivalTeamColor);
  if (!ownTeamColor || !rivalTeamColor) return false;

  const normal = ownTeamColor === detected.team1 && rivalTeamColor === detected.team2;
  const swapped = ownTeamColor === detected.team2 && rivalTeamColor === detected.team1;
  return normal || swapped;
}

function normalizeHex(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return HEX_COLOR.test(normalized) ? normalized : null;
}
