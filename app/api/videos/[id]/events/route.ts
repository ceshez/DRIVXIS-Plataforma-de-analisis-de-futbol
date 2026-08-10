import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  getVideoEventRetryDelay,
  isVideoEventTerminal,
  VIDEO_EVENT_MAX_CONSECUTIVE_FAILURES,
  VIDEO_EVENT_POLL_MS,
  VIDEO_EVENT_RECONNECT_MS,
  VIDEO_EVENT_STREAM_MAX_MS,
} from "@/lib/video-event-stream";
import { serializeVideo } from "@/lib/video-serialization";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: RouteContext) {
  const [user, { id }] = await Promise.all([requireUser(), context.params]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastPayload = "";
      let closed = false;
      let consecutiveFailures = 0;
      const streamStartedAt = Date.now();

      const closeStream = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // The browser may have cancelled the stream before the abort signal reached this handler.
        }
      };

      const handleAbort = () => closeStream();
      request.signal.addEventListener("abort", handleAbort, { once: true });

      try {
        controller.enqueue(encoder.encode(`retry: ${VIDEO_EVENT_RECONNECT_MS}\n\n`));

        while (!closed) {
          if (Date.now() - streamStartedAt >= VIDEO_EVENT_STREAM_MAX_MS) {
            closeStream();
            return;
          }

          try {
            const video = await findVideo(id, user.id);
            consecutiveFailures = 0;
            if (!video) {
              controller.enqueue(
                encoder.encode(`event: video-error\ndata: ${JSON.stringify({ error: "Video no encontrado." })}\n\n`),
              );
              closeStream();
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

            if (isVideoEventTerminal(serialized)) {
              closeStream();
              return;
            }

            await wait(VIDEO_EVENT_POLL_MS);
          } catch (error) {
            if (closed || request.signal.aborted) return;
            consecutiveFailures += 1;
            console.warn(
              `[video-events] transient read failure for ${id} (${consecutiveFailures}/${VIDEO_EVENT_MAX_CONSECUTIVE_FAILURES}): ${formatError(error)}`,
            );
            if (consecutiveFailures >= VIDEO_EVENT_MAX_CONSECUTIVE_FAILURES) {
              closeStream();
              return;
            }
            await wait(getVideoEventRetryDelay(consecutiveFailures));
          }
        }
      } finally {
        request.signal.removeEventListener("abort", handleAbort);
        closeStream();
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

function formatError(error: unknown) {
  return error instanceof Error ? error.message.split("\n").filter(Boolean).at(-1) || error.name : String(error);
}
