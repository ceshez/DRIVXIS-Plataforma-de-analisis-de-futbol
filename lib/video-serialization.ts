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
  const latestJob = video.analysisJobs?.[0] ?? null;
  const latestSnapshot = video.metricSnapshots?.[0] ?? null;
  const metadata = isRecord(video.metadata) ? video.metadata : {};
  const hasProcessedOutput =
    typeof metadata.processedLocalPath === "string" || typeof metadata.annotatedLocalPath === "string";

  return {
    id: video.id,
    objectKey: video.objectKey,
    originalFilename: video.originalFilename,
    status: video.status,
    sizeBytes: video.sizeBytes.toString(),
    durationSeconds: video.durationSeconds ?? null,
    metadata: video.metadata ?? null,
    sourceVideoUrl: `/api/videos/${video.id}/stream?variant=source`,
    processedVideoUrl: hasProcessedOutput ? `/api/videos/${video.id}/stream?variant=processed` : null,
    createdAt: video.createdAt.toISOString(),
    updatedAt: video.updatedAt?.toISOString() ?? null,
    latestJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          progress: latestJob.progress,
          error: latestJob.error,
          createdAt: latestJob.createdAt.toISOString(),
          startedAt: latestJob.startedAt?.toISOString() ?? null,
          endedAt: latestJob.endedAt?.toISOString() ?? null,
        }
      : null,
    latestMetrics: parseAnalysisMetrics(latestSnapshot?.metrics ?? null),
    latestMetricCreatedAt: latestSnapshot?.createdAt.toISOString() ?? null,
  };
}

export function serializeVideos(videos: VideoLike[]) {
  return videos.map(serializeVideo);
}
