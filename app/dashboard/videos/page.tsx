import { DashboardHeader } from "@/components/dashboard-header";
import { VideoHistory } from "@/components/video-history";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeVideos } from "@/lib/video-serialization";

export default async function VideosPage() {
  const user = await requireUser();
  const videos = await getVideos(user.id);

  return (
    <main className="app-frame app-frame--videos-watch">
      <DashboardHeader
        navItems={[
          { href: "/dashboard", label: "Panel", exact: true },
          { href: "/dashboard/videos", label: "Historial" },
        ]}
        action={
          <UserProfileMenu
            name={user.name}
            email={user.email}
            hasAvatar={Boolean(user.avatarObjectKey)}
            avatarVersion={user.updatedAt.toISOString()}
          />
        }
      />

      <VideoHistory initialVideos={videos} />
    </main>
  );
}

async function getVideos(ownerId: string) {
  try {
    const videos = await prisma.video.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 50,
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

    return serializeVideos(videos);
  } catch {
    return [];
  }
}
