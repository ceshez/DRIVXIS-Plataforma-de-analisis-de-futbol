import { NextResponse } from "next/server";
import { kickAnalysisWorker } from "@/lib/analysis-worker";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildStorageUsagePayload } from "@/lib/storage-usage";
import { getLocalObjectPath } from "@/lib/local-storage";
import { createVideoSchema } from "@/lib/validators";
import { serializeVideo, serializeVideos } from "@/lib/video-serialization";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;

class StorageQuotaExceededError extends Error {
  constructor(
    public readonly usedBytes: bigint,
    public readonly limitBytes: bigint,
  ) {
    super("Storage limit exceeded.");
  }
}

export async function GET(request: Request) {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const pageSize = parsePageSize(searchParams.get("limit"));
  const cursor = parseCursor(searchParams.get("cursor"));
  const safeCursor = cursor ? await getOwnedCursor(cursor, user.id) : null;
  let videos;
  let fallbackUsed = false;

  try {
    videos = await prisma.video.findMany({
      where: { ownerId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(safeCursor ? { cursor: { id: safeCursor }, skip: 1 } : {}),
      select: {
        id: true,
        originalFilename: true,
        status: true,
        sizeBytes: true,
        durationSeconds: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        objectKey: true,
        analysisJobs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            progress: true,
            error: true,
            createdAt: true,
            startedAt: true,
            endedAt: true,
          },
        },
        metricSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            jobId: true,
            metrics: true,
            createdAt: true,
          },
        },
      },
    });
  } catch {
    fallbackUsed = true;
    videos = await prisma.video.findMany({
      where: { ownerId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      ...(safeCursor ? { cursor: { id: safeCursor }, skip: 1 } : {}),
      select: {
        id: true,
        originalFilename: true,
        status: true,
        sizeBytes: true,
        durationSeconds: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        objectKey: true,
      },
    });
  }

  const visibleVideos = videos.slice(0, pageSize);
  const serialized = serializeVideos(visibleVideos);
  return NextResponse.json({
    videos: serialized,
    nextCursor: videos.length > pageSize ? visibleVideos.at(-1)?.id ?? null : null,
    ...(fallbackUsed ? { warnings: ["VIDEO_RELATION_FALLBACK_USED"] } : {}),
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = createVideoSchema.safeParse(await request.json().catch(() => null));

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Metadata de video invalida." },
      { status: 400 },
    );
  }

  if (!parsed.data.objectKey.startsWith(`users/${user.id}/videos/`)) {
    return NextResponse.json({ error: "La llave de storage no pertenece al usuario actual." }, { status: 403 });
  }

  const uploadMode = parsed.data.uploadMode || "local";
  const videoSizeBytes = BigInt(parsed.data.sizeBytes);
  const sourceLocalPath = uploadMode === "local" ? getLocalObjectPath(parsed.data.objectKey) : null;
  const matchInfo = parsed.data.matchInfo ?? null;
  let video;
  try {
    video = await prisma.$transaction(async (tx) => {
      const quota = await tx.user.findUnique({
        where: { id: user.id },
        select: {
          storageUsedBytes: true,
          storageLimitBytes: true,
        },
      });
      if (!quota) {
        throw new Error("Usuario no encontrado.");
      }

      const projectedUsage = quota.storageUsedBytes + videoSizeBytes;
      if (projectedUsage > quota.storageLimitBytes) {
        throw new StorageQuotaExceededError(quota.storageUsedBytes, quota.storageLimitBytes);
      }

      const reserveQuota = await tx.user.updateMany({
        where: {
          id: user.id,
          storageUsedBytes: { lte: quota.storageLimitBytes - videoSizeBytes },
        },
        data: {
          storageUsedBytes: { increment: videoSizeBytes },
        },
      });
      if (reserveQuota.count !== 1) {
        const latestQuota = await tx.user.findUnique({
          where: { id: user.id },
          select: {
            storageUsedBytes: true,
            storageLimitBytes: true,
          },
        });
        if (!latestQuota) {
          throw new Error("Usuario no encontrado.");
        }
        throw new StorageQuotaExceededError(latestQuota.storageUsedBytes, latestQuota.storageLimitBytes);
      }

      return tx.video.create({
        data: {
          ownerId: user.id,
          objectKey: parsed.data.objectKey,
          originalFilename: parsed.data.filename,
          mimeType: parsed.data.mimeType,
          sizeBytes: videoSizeBytes,
          durationSeconds: parsed.data.durationSeconds,
          status: "PENDING_ANALYSIS",
          metadata: {
            source: "web-upload",
            storageMode: uploadMode,
            sourceLocalPath,
            processedLocalPath: null,
            annotatedLocalPath: null,
            modelReady: true,
            matchInfo,
          },
          analysisJobs: {
            create: {
              status: "QUEUED",
              progress: 0,
            },
          },
        },
        select: {
          id: true,
          originalFilename: true,
          status: true,
          sizeBytes: true,
          durationSeconds: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          objectKey: true,
          analysisJobs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              status: true,
              progress: true,
              error: true,
              createdAt: true,
              startedAt: true,
              endedAt: true,
            },
          },
          metricSnapshots: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              jobId: true,
              metrics: true,
              createdAt: true,
            },
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      return NextResponse.json(
        {
          error: "Storage limit exceeded.",
          storage: buildStorageUsagePayload(error.usedBytes, error.limitBytes),
        },
        { status: 403 },
      );
    }
    throw error;
  }

  kickAnalysisWorker();
  return NextResponse.json({ video: serializeVideo(video) }, { status: 201 });
}

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.round(parsed)));
}

function parseCursor(value: string | null) {
  const cursor = value?.trim();
  return cursor || null;
}

async function getOwnedCursor(cursor: string, ownerId: string) {
  const video = await prisma.video.findFirst({
    where: { id: cursor, ownerId },
    select: { id: true },
  });
  return video?.id ?? null;
}
