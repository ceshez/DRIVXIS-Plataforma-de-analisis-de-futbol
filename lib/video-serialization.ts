import { isRecord, parseAnalysisMetrics } from "@/lib/analysis-metrics";

type JobLike = {
  id: string;
  status: string;
  progress: number;
  error: string | null;
  createdAt: Date;
  startedAt?: Date | null;
  endedAt?: Date | null;
};

type SnapshotLike = {
  id: string;
  jobId: string | null;
  metrics: unknown;
  createdAt: Date;
};

type VideoLike = {
  id: string;
  objectKey?: string;
  originalFilename: string;
  status: string;
  sizeBytes: bigint;
  durationSeconds?: number | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt?: Date;
  analysisJobs?: JobLike[];
  metricSnapshots?: SnapshotLike[];
};

export function serializeVideo(video: VideoLike) {
  const latestJob = Array.isArray(video.analysisJobs) ? (video.analysisJobs[0] ?? null) : null;
  const latestSnapshot = Array.isArray(video.metricSnapshots) ? (video.metricSnapshots[0] ?? null) : null;
  const safeMetadata = sanitizeJsonLike(video.metadata);
  const metadata = isRecord(safeMetadata) ? safeMetadata : null;
  const warnings: string[] = [];

  if (video.metadata !== null && video.metadata !== undefined && !metadata) {
    warnings.push("VIDEO_METADATA_INVALID");
  }

  const hasProcessedOutput =
    typeof metadata?.processedLocalPath === "string" ||
    typeof metadata?.annotatedLocalPath === "string" ||
    typeof metadata?.processedObjectKey === "string" ||
    typeof metadata?.annotatedObjectKey === "string";

  if (video.status === "COMPLETED" && !hasProcessedOutput) {
    warnings.push("PROCESSED_VIDEO_MISSING");
  }

  if (typeof metadata?.analysisUploadError === "string" && metadata.analysisUploadError.trim()) {
    warnings.push("ANALYSIS_UPLOAD_ERROR");
  }
  if (
    latestJob?.status === "FAILED" &&
    typeof latestJob.error === "string" &&
    /(deleted|no longer exists|not found|missing)/i.test(latestJob.error)
  ) {
    warnings.push("ANALYSIS_INTERRUPTED");
  }

  const normalizedMetadata =
    metadata || warnings.length
      ? {
          ...(metadata ?? {}),
          resilienceWarnings: Array.from(new Set(warnings)),
        }
      : null;

  return {
    id: video.id,
    objectKey: video.objectKey,
    originalFilename: video.originalFilename,
    status: video.status,
    sizeBytes: toSafeBigIntString(video.sizeBytes),
    durationSeconds: video.durationSeconds ?? null,
    metadata: normalizedMetadata,
    sourceVideoUrl: `/api/videos/${video.id}/stream?variant=source`,
    processedVideoUrl: hasProcessedOutput ? `/api/videos/${video.id}/stream?variant=processed` : null,
    createdAt: toIsoString(video.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(video.updatedAt),
    latestJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          progress: Number.isFinite(latestJob.progress) ? latestJob.progress : 0,
          error: latestJob.error,
          createdAt: toIsoString(latestJob.createdAt) ?? new Date(0).toISOString(),
          startedAt: toIsoString(latestJob.startedAt),
          endedAt: toIsoString(latestJob.endedAt),
        }
      : null,
    latestMetrics: safeParseMetrics(latestSnapshot?.metrics ?? null),
    latestMetricCreatedAt: toIsoString(latestSnapshot?.createdAt),
    warnings,
  };
}

export function serializeVideos(videos: VideoLike[]) {
  const serialized: ReturnType<typeof serializeVideo>[] = [];

  for (const video of videos) {
    try {
      serialized.push(serializeVideo(video));
    } catch {
      continue;
    }
  }

  return serialized;
}

function safeParseMetrics(value: unknown) {
  try {
    return parseAnalysisMetrics(value);
  } catch {
    return null;
  }
}

function toIsoString(value?: Date | null) {
  if (!(value instanceof Date)) return null;
  const time = value.getTime();
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

function toSafeBigIntString(value: bigint | number | string) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.max(0, Math.round(value)));
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  return "0";
}

function sanitizeJsonLike(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (value instanceof Date) return toIsoString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonLike(item, seen));
  if (!isRecord(value)) return null;
  if (seen.has(value)) return null;

  seen.add(value);
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    next[key] = sanitizeJsonLike(item, seen);
  }
  seen.delete(value);
  return next;
}
