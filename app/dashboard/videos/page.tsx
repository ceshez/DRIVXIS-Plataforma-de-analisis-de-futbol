import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { VideoHistory } from "@/components/video-history";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeVideos } from "@/lib/video-serialization";

const HISTORY_PAGE_SIZE = 25;

export default async function VideosPage() {
  const user = await requireUser();
  const videosPage = await getVideos(user.id);

  return (
    <main className="app-frame app-frame--videos-watch">
      <DashboardHeader
        navItems={[
          { href: "/dashboard", label: "Panel", exact: true },
          { href: "/dashboard/videos", label: "Historial" },
        ]}
        action={
          <DashboardHeaderUserAction
            name={user.name}
            email={user.email}
            hasAvatar={Boolean(user.avatarObjectKey)}
            avatarVersion={user.updatedAt.toISOString()}
          />
        }
      />

      <VideoHistory initialNextCursor={videosPage.nextCursor} initialVideos={videosPage.videos} />
    </main>
  );
}

async function getVideos(ownerId: string) {
  try {
    const videos = await prisma.video.findMany({
      where: { ownerId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: HISTORY_PAGE_SIZE + 1,
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

    const visibleVideos = videos.slice(0, HISTORY_PAGE_SIZE);
    return {
      videos: serializeVideos(visibleVideos),
      nextCursor: videos.length > HISTORY_PAGE_SIZE ? visibleVideos.at(-1)?.id ?? null : null,
    };
  } catch {
    return { videos: [], nextCursor: null };
  }
}
