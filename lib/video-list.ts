import { Prisma, type VideoStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { serializeVideos } from "@/lib/video-serialization";

export const DEFAULT_VIDEO_PAGE_SIZE = 10;
const MAX_VIDEO_PAGE_SIZE = 50;

const videoListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["UPLOADED", "PENDING_ANALYSIS", "PROCESSING", "COMPLETED", "FAILED"]).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  minSizeMb: z.coerce.number().min(0).max(12288).optional(),
  maxSizeMb: z.coerce.number().min(0).max(12288).optional(),
  sort: z.enum(["newest", "oldest", "name-asc", "name-desc"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_VIDEO_PAGE_SIZE).default(DEFAULT_VIDEO_PAGE_SIZE),
});

export type VideoListQuery = z.infer<typeof videoListQuerySchema>;

const videoListSelect = Prisma.validator<Prisma.VideoSelect>()({
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
    select: { id: true, jobId: true, metrics: true, createdAt: true },
  },
});

const fallbackVideoListSelect = Prisma.validator<Prisma.VideoSelect>()({
  id: true,
  originalFilename: true,
  status: true,
  sizeBytes: true,
  durationSeconds: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  objectKey: true,
});

export function parseVideoListQuery(searchParams: URLSearchParams): VideoListQuery {
  const input = Object.fromEntries(
    ["q", "status", "dateFrom", "dateTo", "minSizeMb", "maxSizeMb", "sort", "page", "limit"]
      .map((key) => [key, searchParams.get(key) || undefined]),
  );
  const parsed = videoListQuerySchema.safeParse(input);
  return parsed.success ? parsed.data : videoListQuerySchema.parse({});
}

export async function getVideoListPage(ownerId: string, query: VideoListQuery) {
  const where = buildVideoWhere(ownerId, query);
  const totalItems = await prisma.video.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const options = {
    where,
    orderBy: getOrderBy(query.sort),
    skip: (page - 1) * query.limit,
    take: query.limit,
  } satisfies Pick<Prisma.VideoFindManyArgs, "where" | "orderBy" | "skip" | "take">;

  try {
    const videos = await prisma.video.findMany({ ...options, select: videoListSelect });
    return {
      videos: serializeVideos(videos),
      pagination: { page, pageSize: query.limit, totalItems, totalPages },
      fallbackUsed: false,
    };
  } catch {
    const videos = await prisma.video.findMany({ ...options, select: fallbackVideoListSelect });
    return {
      videos: serializeVideos(videos),
      pagination: { page, pageSize: query.limit, totalItems, totalPages },
      fallbackUsed: true,
    };
  }
}

function buildVideoWhere(ownerId: string, query: VideoListQuery): Prisma.VideoWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (query.dateFrom) createdAt.gte = new Date(`${query.dateFrom}T00:00:00.000Z`);
  if (query.dateTo) createdAt.lte = new Date(`${query.dateTo}T23:59:59.999Z`);

  const sizeBytes: Prisma.BigIntFilter = {};
  if (query.minSizeMb !== undefined) sizeBytes.gte = BigInt(Math.round(query.minSizeMb * 1024 * 1024));
  if (query.maxSizeMb !== undefined) sizeBytes.lte = BigInt(Math.round(query.maxSizeMb * 1024 * 1024));

  return {
    ownerId,
    ...(query.q ? { originalFilename: { contains: query.q, mode: "insensitive" } } : {}),
    ...(query.status ? { status: query.status as VideoStatus } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(Object.keys(sizeBytes).length ? { sizeBytes } : {}),
  };
}

function getOrderBy(sort: VideoListQuery["sort"]): Prisma.VideoOrderByWithRelationInput[] {
  if (sort === "oldest") return [{ createdAt: "asc" }, { id: "asc" }];
  if (sort === "name-asc") return [{ originalFilename: "asc" }, { id: "asc" }];
  if (sort === "name-desc") return [{ originalFilename: "desc" }, { id: "desc" }];
  return [{ createdAt: "desc" }, { id: "desc" }];
}
