import { DashboardExperience } from "@/components/dashboard-experience";
import { Logo } from "@/components/logo";

const demoVideos = [
  {
    id: "demo-1",
    originalFilename: "final-sub17-vs-academia-sur.mp4",
    status: "PROCESSING",
    createdAt: new Date("2026-04-21T18:30:00.000Z").toISOString(),
  },
  {
    id: "demo-2",
    originalFilename: "jornada-12-bloque-alto.mov",
    status: "COMPLETED",
    createdAt: new Date("2026-04-19T15:10:00.000Z").toISOString(),
  },
  {
    id: "demo-3",
    originalFilename: "amistoso-primer-tiempo.mp4",
    status: "PENDING_ANALYSIS",
    createdAt: new Date("2026-04-16T22:45:00.000Z").toISOString(),
  },
];

export default function DashboardDemoPage() {
  return (
    <main className="app-frame">
      <header className="app-header">
        <Logo href="/" />
        <nav aria-label="Dashboard demo">
          <a href="/dashboard/demo">Demo</a>
          <a href="/">Inicio</a>
        </nav>
        <a className="button ghost" href="/login">
          Login real
        </a>
      </header>

      <DashboardExperience userName="Carlos" videos={demoVideos} />
    </main>
  );
}
