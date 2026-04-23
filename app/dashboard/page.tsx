import { DashboardExperience } from "@/components/dashboard-experience";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();
  const videos = await getRecentVideos(user.id);

  return (
    <main className="app-frame">
      <header className="app-header">
        <Logo href="/dashboard" />
        <nav aria-label="Dashboard">
          <a href="/dashboard">Panel</a>
          <a href="/dashboard/videos">Videos</a>
        </nav>
        <LogoutButton />
      </header>

      <DashboardExperience
        userName={user.name}
        videos={videos.map((video) => ({
          ...video,
          createdAt: video.createdAt.toISOString(),
        }))}
      />
    </main>
  );
}

async function getRecentVideos(ownerId: string) {
  try {
    return await prisma.video.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        originalFilename: true,
        status: true,
        createdAt: true,
      },
    });
  } catch {
    return [];
  }
}
