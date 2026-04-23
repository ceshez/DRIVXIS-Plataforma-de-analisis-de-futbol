import Link from "next/link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { RadarDemo } from "@/components/radar-demo";
import { demoStats } from "@/lib/mock-data";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const dashboardMetrics = [
  { label: "Posesión", value: "58.6%", detail: "DRIVXIS XI" },
  { label: "Pases completados", value: "342", detail: "pases" },
  { label: "Distancia equipo", value: "112.4 km", detail: "recorrido total" },
  { label: "Sprints totales", value: "86", detail: "runs" },
  { label: "Remates", value: "16", detail: "tiros" },
  { label: "Presión alta", value: "74%", detail: "intensidad" },
];

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
          <p className="eyebrow">Modulo</p>
          <h1>Dashboard de análisis</h1>
          <p>
            Hola, {user.name}. Tu laboratorio tactico esta listo con métricas, fases, mapas y
            actividad reciente.
          </p>
        </div>
        <span className="status-chip">En espera</span>
      </section>

      <section className="metric-grid metric-grid--band" aria-label="Metricas del partido demo">
        {dashboardMetrics.map((metric) => (
          <article className="metric-card metric-card--band" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <RadarDemo />

        <section className="timeline-panel">
          <p className="eyebrow">Estadísticas clave</p>
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
