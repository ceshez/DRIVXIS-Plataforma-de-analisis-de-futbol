export const VIDEO_EVENT_POLL_MS = 5_000;
export const VIDEO_EVENT_RECONNECT_MS = 3_000;
export const VIDEO_EVENT_STREAM_MAX_MS = 45_000;
export const VIDEO_EVENT_MAX_CONSECUTIVE_FAILURES = 3;

type VideoEventState = {
  status?: string | null;
  latestJob?: { status?: string | null } | null;
};

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED"]);

export function isVideoEventTerminal(video: VideoEventState) {
  return TERMINAL_STATUSES.has(video.status || "") || TERMINAL_STATUSES.has(video.latestJob?.status || "");
}

export function getVideoEventRetryDelay(consecutiveFailures: number) {
  const safeFailures = Math.max(1, Math.floor(consecutiveFailures));
  return Math.min(15_000, 1_000 * 2 ** safeFailures);
}
