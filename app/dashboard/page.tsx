import { DashboardExperience } from "@/components/dashboard-experience";
import { DashboardHeader } from "@/components/dashboard-header";
import { LogoutButton } from "@/components/logout-button";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { serializeVideos } from "@/lib/video-serialization";

export default async function DashboardPage() {
  const user = await requireUser();
  const videos = await getRecentVideos(user.id);

  return (
    <main className="app-frame">
      <DashboardHeader
        navItems={[
          { href: "/dashboard", label: "Panel", exact: true },
          { href: "/dashboard/videos", label: "Historial" },
        ]}
        action={<LogoutButton />}
      />

      <DashboardExperience
        userName={user.name}
        videos={videos}
      />
    </main>
  );
}

async function getRecentVideos(ownerId: string) {
  try {
    const videos = await prisma.video.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 4,
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
