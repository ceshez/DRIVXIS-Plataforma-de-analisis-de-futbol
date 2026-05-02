import { DashboardExperience } from "@/components/dashboard-experience";
import { DashboardHeader } from "@/components/dashboard-header";

const demoVideos = [
  {
    id: "demo-1",
    originalFilename: "final-sub17-vs-academia-sur.mp4",
    status: "PROCESSING",
    sizeBytes: "419430400",
    createdAt: new Date("2026-04-21T18:30:00.000Z").toISOString(),
    sourceVideoUrl: "/api/videos/demo-1/stream?variant=source",
    processedVideoUrl: null,
    latestJob: {
      id: "demo-job-1",
      status: "RUNNING",
      progress: 58,
      error: null,
    },
  },
  {
    id: "demo-2",
    originalFilename: "jornada-12-bloque-alto.mov",
    status: "COMPLETED",
    sizeBytes: "209715200",
    createdAt: new Date("2026-04-19T15:10:00.000Z").toISOString(),
    sourceVideoUrl: "/api/videos/demo-2/stream?variant=source",
    processedVideoUrl: "/api/videos/demo-2/stream?variant=processed",
    latestMetrics: {
      version: 1 as const,
      source: "demo",
      possession: { team1Pct: 57.4, team2Pct: 42.6, unknownPct: 0 },
      ballControl: { ownTeam: 57.4, rivalTeam: 42.6, unknown: 0 },
      speed: {
        maxKmh: 0,
        avgKmh: 0,
        rawMaxKmh: 31.4,
        publishable: false,
        note: "Speed is diagnostic only.",
        validSamples: 184,
        rejectedSamples: 11,
        rejectionReasons: { outside_pitch: 7, implausible_track_jump: 4 },
        calibrationStatus: "default_homography",
        players: [],
      },
      distance: {
        totalMeters: 103240,
        teams: {
          own: { name: "Equipo 1", totalMeters: 52840, totalKm: 52.84 },
          rival: { name: "Equipo 2", totalMeters: 50400, totalKm: 50.4 },
        },
      },
      teamDistances: { ownTeam: 52840, rivalTeam: 50400 },
      players: { detected: 22 },
      quality: { goalkeepers: { detected: 2, assigned: 2, items: [] } },
      video: { frameCount: 1240, fps: 24, durationSeconds: 51.7, annotatedAvailable: true },
    },
  },
  {
    id: "demo-3",
    originalFilename: "amistoso-primer-tiempo.mp4",
    status: "PENDING_ANALYSIS",
    sizeBytes: "104857600",
    createdAt: new Date("2026-04-16T22:45:00.000Z").toISOString(),
    sourceVideoUrl: "/api/videos/demo-3/stream?variant=source",
    processedVideoUrl: null,
  },
];

export default function DashboardDemoPage() {
  return (
    <main className="app-frame">
      <DashboardHeader
        logoHref="/"
        navLabel="Dashboard demo"
        navItems={[
          { href: "/dashboard/demo", label: "Demo", exact: true },
          { href: "/", label: "Inicio", exact: true },
        ]}
        action={
          <a className="button ghost" href="/login">
            Login real
          </a>
        }
      />

      <DashboardExperience userName="Carlos" videos={demoVideos} pollingEnabled={false} />
    </main>
  );
}
