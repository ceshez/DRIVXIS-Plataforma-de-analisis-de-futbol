import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createVideoSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireUser();
  const videos = await prisma.video.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      originalFilename: true,
      status: true,
      sizeBytes: true,
      createdAt: true,
      objectKey: true,
    },
  });

  return NextResponse.json({ videos: serializeVideos(videos) });
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

  const video = await prisma.video.create({
    data: {
      ownerId: user.id,
      objectKey: parsed.data.objectKey,
      originalFilename: parsed.data.filename,
      mimeType: parsed.data.mimeType,
      sizeBytes: BigInt(parsed.data.sizeBytes),
      durationSeconds: parsed.data.durationSeconds,
      status: "PENDING_ANALYSIS",
      metadata: {
        source: "web-upload",
        modelReady: false,
      },
      analysisJobs: {
        create: {
          status: "QUEUED",
          progress: 0,
        },
      },
      metricSnapshots: {
        create: {
          metrics: {
            possession: { home: 58, away: 42 },
            distanceKm: 108.7,
            maxSpeedKmh: 33.8,
            notes: "Mock snapshot until the computer vision model is connected.",
          },
        },
      },
    },
    select: {
      id: true,
      originalFilename: true,
      status: true,
      sizeBytes: true,
      createdAt: true,
      objectKey: true,
    },
  });

  return NextResponse.json({ video: serializeVideo(video) }, { status: 201 });
}

function serializeVideos<T extends { sizeBytes: bigint; createdAt: Date }>(videos: T[]) {
  return videos.map(serializeVideo);
}

function serializeVideo<T extends { sizeBytes: bigint; createdAt: Date }>(video: T) {
  return {
    ...video,
    sizeBytes: video.sizeBytes.toString(),
    createdAt: video.createdAt.toISOString(),
  };
}
