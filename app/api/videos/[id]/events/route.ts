import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeVideo } from "@/lib/video-serialization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const user = await requireUser();
  const { id } = await context.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastPayload = "";
      let closed = false;

      request.signal.addEventListener("abort", () => {
        closed = true;
        controller.close();
      });

      while (!closed) {
        const video = await findVideo(id, user.id);
        if (!video) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: "Video no encontrado." })}\n\n`));
          controller.close();
          return;
        }

        const serialized = serializeVideo(video);
        const payload = JSON.stringify(serialized);
        if (payload !== lastPayload) {
          controller.enqueue(encoder.encode(`event: video\ndata: ${payload}\n\n`));
          lastPayload = payload;
        } else {
          controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
        }

        if (serialized.status === "COMPLETED" || serialized.status === "FAILED") {
          controller.close();
          return;
        }

        await wait(1500);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
}

async function findVideo(id: string, ownerId: string) {
  return prisma.video.findFirst({
    where: { id, ownerId },
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
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
