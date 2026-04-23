import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { UploadPanel } from "@/components/upload-panel";
import { AnnotationLine, MicroGrid } from "@/components/micro-graphics";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function VideosPage() {
  const user = await requireUser();
  const videos = await getVideos(user.id);

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

      <section className="dashboard-command dashboard-command--compact">
        <MicroGrid />
        <div className="dashboard-command__copy">
          <AnnotationLine label="storage" value="S3-COMPATIBLE / VIDEOS" />
          <h1>Biblioteca de videos</h1>
          <p>
            Guarda metadata en PostgreSQL y envia archivos al bucket configurado con URLs firmadas.
            Si faltan credenciales, DRIVXIS conserva la metadata para desarrollo local.
          </p>
        </div>
      </section>

      <UploadPanel initialVideos={videos} />
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
        createdAt: true,
      },
    });

    return videos.map((video) => ({
      ...video,
      sizeBytes: video.sizeBytes.toString(),
      createdAt: video.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
