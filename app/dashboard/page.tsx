import Link from "next/link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { RadarDemo } from "@/components/radar-demo";
import { demoStats } from "@/lib/mock-data";
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
          <Link href="/dashboard">Panel</Link>
          <Link href="/dashboard/videos">Videos</Link>
        </nav>
        <LogoutButton />
      </header>

      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Dashboard V1</p>
          <h1>Hola, {user.name}. Tu laboratorio tactico esta listo.</h1>
          <p>
            Estos datos son mock realista para validar la experiencia mientras el pipeline YOLO,
            tracking y homografia se conecta en la siguiente fase.
          </p>
        </div>
        <Link className="button primary" href="/dashboard/videos">
          Gestionar videos
        </Link>
      </section>

      <section className="metric-grid" aria-label="Metricas del partido demo">
        {demoStats.matchMetrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <RadarDemo />

        <section className="timeline-panel">
          <p className="eyebrow">Timeline de eventos</p>
          <h2>Lectura por tramos</h2>
          <div className="timeline-list">
            {demoStats.timeline.map((event) => (
              <article className={`timeline-item ${event.tone}`} key={`${event.minute}-${event.event}`}>
                <time>{event.minute}</time>
                <span>{event.event}</span>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="recent-videos">
        <div>
          <p className="eyebrow">Videos recientes</p>
          <h2>Material en cola</h2>
        </div>
        {videos.length === 0 ? (
          <p className="muted">No hay videos registrados todavia.</p>
        ) : (
          videos.map((video) => (
            <article className="video-row" key={video.id}>
              <div>
                <strong>{video.originalFilename}</strong>
                <span>{video.createdAt.toLocaleDateString("es-CR")}</span>
              </div>
              <span className={`status-pill ${video.status.toLowerCase()}`}>{video.status.toLowerCase()}</span>
            </article>
          ))
        )}
      </section>
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
