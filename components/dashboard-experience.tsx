"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, Film, History, Loader2, ScanLine, Shield, Upload } from "lucide-react";
import { getMetricDisplay, type AnalysisMetrics } from "@/lib/analysis-metrics";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";
import { VideoUploadDropzone, type UploadedVideo } from "@/components/video-upload-dropzone";

type RecentVideo = {
  id: string;
  originalFilename: string;
  status: string;
  createdAt: string;
  sizeBytes?: string;
  sourceVideoUrl?: string;
  processedVideoUrl?: string | null;
  latestMetrics?: AnalysisMetrics | null;
  latestJob?: {
    id: string;
    status: string;
    progress: number;
    error: string | null;
  } | null;
};

type DashboardExperienceProps = {
  userName: string;
  videos: RecentVideo[];
  pollingEnabled?: boolean;
};

const radarFallback = [
  { subject: "VEL", local: 72, rival: 68 },
  { subject: "TEC", local: 64, rival: 60 },
  { subject: "FIS", local: 70, rival: 66 },
  { subject: "TAC", local: 58, rival: 54 },
  { subject: "AIR", local: 52, rival: 48 },
  { subject: "PRE", local: 61, rival: 59 },
];

const intensityData = [
  { minute: "0'", value: 42 },
  { minute: "15'", value: 58 },
  { minute: "30'", value: 71 },
  { minute: "45'", value: 54 },
  { minute: "60'", value: 82 },
  { minute: "75'", value: 76 },
  { minute: "90'", value: 68 },
];

const zoneData = [
  { zone: "DEF", value: 28 },
  { zone: "MED-D", value: 42 },
  { zone: "MED-A", value: 65 },
  { zone: "ATQ", value: 84 },
];

const analysisSteps = ["Subida validada", "Cola IA", "Tracking YOLO", "Metricas", "Reporte"];

export function DashboardExperience({ userName, videos, pollingEnabled = true }: DashboardExperienceProps) {
  const [items, setItems] = useState(videos);
  const [activeId, setActiveId] = useState(videos[0]?.id ?? "");
  const [uploadOpen, setUploadOpen] = useState(videos.length === 0);
  const featured = items.find((video) => video.id === activeId) ?? items[0] ?? null;
  const metrics = featured?.latestMetrics ?? null;
  const display = getMetricDisplay(metrics);
  const bottomStats = buildBottomStats(metrics);
  const radarData = useMemo(() => buildRadar(metrics), [metrics]);
  const stepIndex = getStepIndex(featured?.status, featured?.latestJob?.status);
  const activeProgress = getVideoProgress(featured);
  const hasProcessingVideo = items.some(isVideoProcessing);
  const isFeaturedProcessing = featured ? isVideoProcessing(featured) : false;
  const pollTarget = featured && isVideoProcessing(featured) ? featured : items.find(isVideoProcessing) ?? null;
  const canUpload = !hasProcessingVideo;

  useEffect(() => {
    if (!featured && items[0]) {
      setActiveId(items[0].id);
    }
  }, [featured, items]);

  useEffect(() => {
    if (!pollingEnabled || !pollTarget) return;

    const intervalId = window.setInterval(() => {
      void refreshVideo(pollTarget.id);
    }, 4000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [pollTarget?.id, pollingEnabled]);

  function handleUploaded(video: UploadedVideo) {
    setItems((current) => [video as RecentVideo, ...current.filter((item) => item.id !== video.id)]);
    setActiveId(video.id);
    setUploadOpen(false);
  }

  async function refreshVideo(videoId: string) {
    const response = await fetch(`/api/videos/${videoId}`, { method: "GET", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { video?: RecentVideo };
    if (!response.ok || !data.video) return;
    setItems((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
  }

  function openUploader() {
    if (!canUpload) return;
    setUploadOpen(true);
  }

  return (
    <div className="dashboard-lab">
      <section className="dashboard-command">
        <MicroGrid />
        <div className="dashboard-command__copy">
          <AnnotationLine label="modulo" value="DRIVXIS / ANALISIS IA" />
          <h1>Dashboard de analisis</h1>
          <p>
            Hola, {userName}. Sube un partido desde la consola central y el worker generara video anotado,
            posesion y velocidad por jugador.
          </p>
        </div>
        <div className="live-chip">
          <span />
          {featured ? formatStatus(featured.status) : "En espera"}
        </div>
      </section>

      <section className="analysis-console" aria-label="Consola de analisis">
        <div className="analysis-console__stage">
          <CornerMarks size={14} opacity={0.45} />
          <div className="console-toolbar">
            <div>
              <span>{featured ? "Ultimo partido" : "Entrada de video"}</span>
              <strong>{featured?.originalFilename ?? "Sube tu primer partido"}</strong>
            </div>
            <a className="icon-button" href="/dashboard/videos" aria-label="Ver historial">
              <Film size={15} />
            </a>
          </div>

          <div className="video-radar video-radar--upload">
            {isFeaturedProcessing ? (
              <AnalysisProgressPanel video={featured} progress={activeProgress} />
            ) : featured?.status === "COMPLETED" && getProcessedVideoUrl(featured) && !uploadOpen ? (
              <AnalyzedVideoPanel video={featured} onUploadAnother={openUploader} />
            ) : (
              <VideoUploadDropzone
                onUploaded={handleUploaded}
                disabled={!canUpload}
                disabledMessage={`Analizando video... (${activeProgress}%)`}
                progress={hasProcessingVideo ? activeProgress : undefined}
                label={items.length ? "Analizar otro partido" : "Selecciona o arrastra un partido"}
                description={items.length ? "El resultado anterior queda guardado en historial." : "MP4, MOV, AVI o formatos compatibles con el pipeline."}
              />
            )}
          </div>

          <div className="analysis-steps">
            {analysisSteps.map((step, index) => (
              <div className="analysis-step" key={step}>
                <span className={index < stepIndex ? "is-complete" : index === stepIndex ? "is-active" : ""}>
                  {index < stepIndex ? <CheckCircle2 size={9} /> : null}
                </span>
                {step}
              </div>
            ))}
          </div>
        </div>

        <aside className="match-panel">
          <CornerMarks size={12} opacity={0.35} />
          <div className="score-card">
            <div>
              <span>Equipo 1</span>
              <strong>{display.possession}%</strong>
            </div>
            <div className="score-card__score">
              <b>{Math.round(metrics?.possession.team1Pct ?? 0)}</b>
              <span>/</span>
              <b>{Math.round(metrics?.possession.team2Pct ?? 0)}</b>
            </div>
            <div>
              <span>Equipo 2</span>
              <strong>{(metrics?.possession.team2Pct ?? 0).toFixed(1)}%</strong>
            </div>
          </div>

          <div className="player-stat-list">
            <h2>Estadisticas del modelo</h2>
            {[
              { label: "Vel. maxima", value: display.maxSpeed, unit: "km/h", bar: Number(display.maxSpeed) * 2.4 },
              { label: "Vel. promedio", value: display.avgSpeed, unit: "km/h", bar: Number(display.avgSpeed) * 3 },
              { label: "Distancia total", value: display.distanceKm, unit: "km", bar: Math.min(92, Number(display.distanceKm) * 10) },
              { label: "Frames", value: display.frameCount, unit: "", bar: 72 },
            ].map((stat) => (
              <article className="player-stat" key={stat.label}>
                <div>
                  <span>{stat.label}</span>
                  <small>{featured ? formatStatus(featured.status) : "sin video"}</small>
                </div>
                <strong>
                  {stat.value}
                  {stat.unit ? <small>{stat.unit}</small> : null}
                </strong>
                <span className="meter">
                  <span style={{ width: `${Math.max(0, Math.min(100, stat.bar))}%` }} />
                </span>
              </article>
            ))}
          </div>

          <div className="radar-card">
            <h2>Rendimiento global</h2>
            <ResponsiveContainer width="100%" height={170}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,107,43,0.13)" strokeDasharray="3 3" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "rgba(255,255,255,0.34)", fontSize: 8 }} />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar dataKey="local" stroke="#ff6b2b" strokeWidth={1.6} fill="#ff6b2b" fillOpacity={0.12} />
                <Radar dataKey="rival" stroke="rgba(255,255,255,0.26)" strokeWidth={1} fill="none" />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </aside>
      </section>

      <section className="stat-strip" aria-label="Metricas del partido">
        {bottomStats.map((stat, index) => (
          <article className="stat-cell" key={stat.label}>
            <span>{stat.label}</span>
            <strong>
              {stat.value}
              <small>{stat.unit}</small>
            </strong>
            <span className="meter">
              <span style={{ width: `${stat.bar}%` }} />
            </span>
            <b>{String(index + 1).padStart(2, "0")}</b>
          </article>
        ))}
      </section>

      <section className="chart-grid">
        <article className="chart-panel chart-panel--wide">
          <Crosshair className="chart-crosshair" size={15} opacity={0.16} />
          <h2>Intensidad de deteccion</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={intensityData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="rgba(255,107,43,0.08)" strokeDasharray="3 3" />
              <XAxis dataKey="minute" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ stroke: "rgba(255,107,43,0.2)" }} contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,107,43,0.25)", color: "#f2f0ee" }} />
              <Line type="monotone" dataKey="value" stroke="#ff6b2b" strokeWidth={1.6} dot={{ r: 2.5, fill: "#ff6b2b", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel">
          <h2>Control por fase</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={zoneData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke="rgba(255,107,43,0.08)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="zone" tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(255,107,43,0.04)" }} contentStyle={{ background: "#0b0b0b", border: "1px solid rgba(255,107,43,0.25)", color: "#f2f0ee" }} />
              <Bar dataKey="value">
                {zoneData.map((_, index) => (
                  <Cell key={index} fill={`rgba(255,107,43,${0.25 + index * 0.16})`} stroke="#ff6b2b" strokeWidth={0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel chart-panel--field">
          <h2>Mapa del modelo</h2>
          <svg viewBox="0 0 240 130" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="236" height="126" stroke="rgba(255,107,43,0.24)" strokeWidth="0.75" />
            <line x1="120" y1="2" x2="120" y2="128" stroke="rgba(255,107,43,0.14)" strokeWidth="0.5" />
            <circle cx="120" cy="65" r="20" stroke="rgba(255,107,43,0.14)" strokeWidth="0.5" />
            <ellipse cx="70" cy="63" rx="34" ry="30" fill="rgba(255,107,43,0.12)" />
            <ellipse cx="154" cy="68" rx="26" ry="22" fill="rgba(255,107,43,0.2)" />
            <circle cx="155" cy="65" r="3.5" stroke="#ff6b2b" strokeWidth="0.75" />
          </svg>
        </article>
      </section>

      <section className="recent-videos lab-panel">
        <div className="panel-heading">
          <div>
            <span>Biblioteca</span>
            <h2>Material reciente</h2>
          </div>
          <a href="/dashboard/videos" className="text-command">
            <History size={13} />
            Historial
          </a>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <ScanLine size={24} />
            <strong>No hay videos registrados todavia.</strong>
            <span>Sube tu primer partido desde la consola central.</span>
          </div>
        ) : (
          <div className="video-list">
            {items.slice(0, 4).map((video) => (
              <article className="video-row" key={video.id}>
                <Film size={17} />
                <div>
                  <strong>{video.originalFilename}</strong>
                  <span>{formatDate(video.createdAt)}</span>
                </div>
                <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="security-line">
        <Activity size={15} />
        <span>Pipeline conectado a cola local de vision, tracking y metricas por partido.</span>
        <Shield size={15} />
      </section>
    </div>
  );
}

function AnalysisProgressPanel({ video, progress }: { video: RecentVideo; progress: number }) {
  return (
    <div className="analysis-result-panel analysis-result-panel--processing">
      <MicroGrid />
      <div className="analysis-result-panel__inner">
        <span className="analysis-upload__icon">
          <Loader2 className="spin" size={30} />
        </span>
        <div>
          <strong>{video.originalFilename}</strong>
          <small>Analizando video... ({progress}%)</small>
        </div>
        <span className="analysis-upload__progress" aria-label={`Progreso ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </span>
        <span className="analysis-result-panel__meta">
          El upload queda bloqueado hasta terminar el tracking y la generacion del video anotado.
        </span>
      </div>
    </div>
  );
}

function AnalyzedVideoPanel({ video, onUploadAnother }: { video: RecentVideo; onUploadAnother: () => void }) {
  return (
    <div className="analysis-result-panel">
      <video
        className="analysis-video analysis-video--dashboard"
        src={getProcessedVideoUrl(video) ?? `/api/videos/${video.id}/stream?variant=processed`}
        controls
        preload="metadata"
      />
      <div className="analysis-result-panel__footer">
        <div>
          <span>Resultado listo</span>
          <strong>{video.originalFilename}</strong>
        </div>
        <button className="button primary command-button" type="button" onClick={onUploadAnother}>
          <Upload size={14} />
          Analizar otro partido
        </button>
      </div>
    </div>
  );
}

function buildBottomStats(metrics: AnalysisMetrics | null) {
  const display = getMetricDisplay(metrics);
  return [
    { label: "Posesion Eq. 1", value: display.possession, unit: "%", bar: Number(display.possession) || 0 },
    { label: "Posesion Eq. 2", value: (metrics?.possession.team2Pct ?? 0).toFixed(1), unit: "%", bar: metrics?.possession.team2Pct ?? 0 },
    { label: "Vel. maxima", value: display.maxSpeed, unit: "km/h", bar: Math.min(100, Number(display.maxSpeed) * 2.4) },
    { label: "Vel. media", value: display.avgSpeed, unit: "km/h", bar: Math.min(100, Number(display.avgSpeed) * 3) },
    { label: "Distancia", value: display.distanceKm, unit: "km", bar: Math.min(100, Number(display.distanceKm) * 10) },
    { label: "Frames", value: display.frameCount, unit: "", bar: metrics ? 82 : 0 },
  ];
}

function buildRadar(metrics: AnalysisMetrics | null) {
  if (!metrics) return radarFallback;
  const possession = metrics.possession.team1Pct;
  const speed = Math.min(100, metrics.speed.maxKmh * 2.4);
  const average = Math.min(100, metrics.speed.avgKmh * 3);
  const distance = Math.min(100, metrics.distance.totalMeters / 80);
  return [
    { subject: "VEL", local: speed, rival: average },
    { subject: "POS", local: possession, rival: metrics.possession.team2Pct },
    { subject: "DIS", local: distance, rival: Math.max(10, distance * 0.72) },
    { subject: "FPS", local: Math.min(100, metrics.video.fps * 3), rival: 60 },
    { subject: "FRM", local: metrics.video.frameCount ? 80 : 0, rival: 50 },
    { subject: "IA", local: metrics.video.annotatedAvailable ? 92 : 20, rival: 52 },
  ];
}

function isVideoProcessing(video: RecentVideo) {
  return (
    video.status === "PENDING_ANALYSIS" ||
    video.status === "PROCESSING" ||
    video.latestJob?.status === "QUEUED" ||
    video.latestJob?.status === "RUNNING"
  );
}

function getProcessedVideoUrl(video: RecentVideo) {
  return video.processedVideoUrl || null;
}

function getVideoProgress(video: RecentVideo | null) {
  if (!video) return 0;
  if (video.status === "COMPLETED") return 100;
  if (video.status === "FAILED") return 100;
  return Math.max(0, Math.min(99, Math.round(video.latestJob?.progress ?? (video.status === "PENDING_ANALYSIS" ? 5 : 0))));
}

function getStepIndex(videoStatus?: string, jobStatus?: string) {
  if (!videoStatus) return 0;
  if (videoStatus === "PENDING_ANALYSIS") return 1;
  if (videoStatus === "PROCESSING" || jobStatus === "RUNNING") return 2;
  if (videoStatus === "COMPLETED") return 5;
  if (videoStatus === "FAILED") return 4;
  return 0;
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}
