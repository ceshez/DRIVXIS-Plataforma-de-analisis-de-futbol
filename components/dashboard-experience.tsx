"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, CheckCircle2, Film, History, Loader2, ScanLine, Shield, Upload } from "lucide-react";
import { getMetricDisplay, type AnalysisMetrics } from "@/lib/analysis-metrics";
import { AnalysisVideoPlayer } from "@/components/analysis-video-player";
import { ToastViewport, useAppToasts } from "@/components/app-toast";
import { MatchColorEditor } from "@/components/match-color-editor";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";
import { VideoUploadDropzone, type UploadedVideo } from "@/components/video-upload-dropzone";

type RecentVideo = {
  id: string;
  originalFilename: string;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
  sizeBytes?: string;
  metadata?: unknown;
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

type MatchInfo = {
  ownTeam?: string;
  rivalTeam?: string;
  ownTeamColor?: string;
  rivalTeamColor?: string;
};

type DashboardExperienceProps = {
  userName: string;
  videos: RecentVideo[];
  pollingEnabled?: boolean;
};

const radarFallback = [
  { subject: "Control", local: 52, rival: 48, localValue: "52.0%", rivalValue: "48.0%" },
  { subject: "Distancia", local: 64, rival: 60, localValue: "6.4 km", rivalValue: "6.0 km" },
  { subject: "Dominio", local: 56, rival: 44, localValue: "56", rivalValue: "44" },
  { subject: "Ritmo", local: 61, rival: 57, localValue: "61", rivalValue: "57" },
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

const analysisSteps = ["Subida validada", "Cola IA", "Tracking YOLO", "métricas", "Reporte"];

export function DashboardExperience({ userName, videos, pollingEnabled = true }: DashboardExperienceProps) {
  const [items, setItems] = useState(videos);
  const [activeId, setActiveId] = useState(videos[0]?.id ?? "");
  const [uploadOpen, setUploadOpen] = useState(videos.length === 0);
  const { toasts, pushToast, dismissToast } = useAppToasts();
  const featured = items.find((video) => video.id === activeId) ?? items[0] ?? null;
  const metrics = featured?.latestMetrics ?? null;
  const matchInfo = getVideoMatchInfo(featured);
  const ownTeamName = metrics?.match?.ownTeam ?? matchInfo.ownTeam ?? "Equipo 1";
  const rivalTeamName = metrics?.match?.rivalTeam ?? matchInfo.rivalTeam ?? "Equipo 2";
  const ownGoals = metrics?.match?.ownGoals ?? 0;
  const rivalGoals = metrics?.match?.rivalGoals ?? 0;
  const display = getMetricDisplay(metrics);
  const bottomStats = buildBottomStats(metrics);
  const ownDistanceKm = getOwnDistanceKm(metrics);
  const rivalDistanceKm = getRivalDistanceKm(metrics);
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

    const eventSource = new EventSource(`/api/videos/${pollTarget.id}/events`);
    eventSource.addEventListener("video", (event) => {
      const nextVideo = JSON.parse((event as MessageEvent).data) as RecentVideo;
      setItems((current) => {
        const previous = current.find((video) => video.id === nextVideo.id);
        if (previous?.status !== "COMPLETED" && nextVideo.status === "COMPLETED") {
          pushToast("análisis terminado. El video ya está listo para revisarse.", {
            dedupeKey: `${nextVideo.id}:completed`,
            durationMs: 8500,
            sound: true,
          });
        }
        return current.map((video) => (video.id === nextVideo.id ? nextVideo : video));
      });
      if (nextVideo.status === "COMPLETED" || nextVideo.status === "FAILED") {
        setActiveId(nextVideo.id);
        eventSource.close();
      }
    });
    eventSource.onerror = () => {
      eventSource.close();
      void refreshVideo(pollTarget.id);
    };

    return () => {
      eventSource.close();
    };
  }, [pollTarget?.id, pollingEnabled, pushToast]);

  function handleUploaded(video: UploadedVideo) {
    setItems((current) => [video as RecentVideo, ...current.filter((item) => item.id !== video.id)]);
    setActiveId(video.id);
    setUploadOpen(false);
    pushToast("Video recibido. Iniciando análisis.", {
      dedupeKey: `${video.id}:queued`,
      durationMs: 7000,
      sound: true,
    });
  }

  async function refreshVideo(videoId: string) {
    const response = await fetch(`/api/videos/${videoId}`, { method: "GET", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { video?: RecentVideo };
    if (!response.ok || !data.video) return;
    setItems((current) => {
      const previous = current.find((video) => video.id === data.video!.id);
      if (previous?.status !== "COMPLETED" && data.video!.status === "COMPLETED") {
        pushToast("análisis terminado. El video ya está listo para revisarse.", {
          dedupeKey: `${data.video!.id}:completed`,
          durationMs: 8500,
          sound: true,
        });
      }
      return current.map((video) => (video.id === data.video!.id ? data.video! : video));
    });
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
          <AnnotationLine label="módulo" value="DRIVXIS / ANÁLISIS IA" />
          <h1>Dashboard de análisis</h1>
          <p>
            Hola, {userName}. Sube un partido desde la consola central y el worker generará video anotado,
            control del balón y distancia agregada por equipo.
          </p>
        </div>
        <div className="live-chip">
          <span />
          {featured ? formatStatus(featured.status) : "En espera"}
        </div>
      </section>

      <section className="analysis-console" aria-label="Consola de análisis">
        <div className="analysis-console__stage">
          <CornerMarks size={14} opacity={0.45} />
          <div className="console-toolbar">
            <div>
              <span>{featured ? "Último partido" : "Entrada de video"}</span>
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
              <AnalyzedVideoPanel
                video={featured}
                onToast={(message) => pushToast(message, { durationMs: 7000, sound: true })}
                onUploadAnother={openUploader}
                onVideoUpdated={(video) => {
                  setItems((current) => current.map((item) => (item.id === video.id ? video : item)));
                }}
              />
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
          <div className="score-card" title={`${ownTeamName}: ${display.possession}% / ${rivalTeamName}: ${display.rivalPossession}%`}>
            <div>
              <span className="score-card__team-label">
                {matchInfo.ownTeamColor ? <i style={{ background: matchInfo.ownTeamColor }} /> : null}
                {ownTeamName}
              </span>
              <strong>{display.possession}%</strong>
            </div>
            <div className="score-card__score">
              <b>{ownGoals}</b>
              <span>/</span>
              <b>{rivalGoals}</b>
            </div>
            <div>
              <span className="score-card__team-label">
                {matchInfo.rivalTeamColor ? <i style={{ background: matchInfo.rivalTeamColor }} /> : null}
                {rivalTeamName}
              </span>
              <strong>{display.rivalPossession}%</strong>
            </div>
          </div>

          <div className="player-stat-list">
            <h2>Métricas del partido</h2>
            {[
              { label: `Control ${ownTeamName}`, value: display.possession, unit: "%", bar: Number(display.possession) },
              { label: `Control ${rivalTeamName}`, value: display.rivalPossession, unit: "%", bar: Number(display.rivalPossession) },
              {
                label: `Dist. ${ownTeamName}`,
                value: formatKm(ownDistanceKm),
                unit: "km",
                bar: Math.min(92, ownDistanceKm * 10),
              },
              {
                label: `Dist. ${rivalTeamName}`,
                value: formatKm(rivalDistanceKm),
                unit: "km",
                bar: Math.min(92, rivalDistanceKm * 10),
              },
            ].map((stat) => (
              <article className="player-stat" key={stat.label} title={`${stat.label}: ${stat.value}${stat.unit}`} aria-label={`${stat.label}: ${stat.value}${stat.unit}`}>
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
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="local" stroke="#ff6b2b" strokeWidth={1.6} fill="#ff6b2b" fillOpacity={0.12} />
                <Radar dataKey="rival" stroke="rgba(255,255,255,0.26)" strokeWidth={1} fill="none" />
                <Tooltip content={<GlobalRadarTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </aside>
      </section>

      <section className="stat-strip" aria-label="métricas del partido">
        {bottomStats.map((stat, index) => (
          <article className="stat-cell" key={stat.label} title={`${stat.label}: ${stat.value}${stat.unit}`} aria-label={`${stat.label}: ${stat.value}${stat.unit}`}>
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
          <h2>Intensidad de detección</h2>
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
            <strong>No hay videos registrados todavía.</strong>
            <span>Sube tu primer partido desde la consola central.</span>
          </div>
        ) : (
          <div className="video-list">
            {items.slice(0, 4).map((video) => (
              <button
                className={`video-row video-row--button ${video.id === featured?.id ? "is-selected" : ""}`}
                key={video.id}
                type="button"
                onClick={() => {
                  setActiveId(video.id);
                  setUploadOpen(false);
                }}
              >
                <span className="video-row__icon">
                  <Film size={17} />
                </span>
                <div className="video-row__copy">
                  <strong>{video.originalFilename}</strong>
                  <span>{formatVideoOpponent(video)}</span>
                </div>
                <span className="video-row__meta">{formatDate(video.createdAt)}</span>
                <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="security-line">
        <Activity size={15} />
        <span>Pipeline conectado a cola local de visión, tracking y métricas por partido.</span>
        <Shield size={15} />
      </section>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
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
          El upload queda bloqueado hasta terminar el tracking y la generación del video anotado.
        </span>
      </div>
    </div>
  );
}

function AnalyzedVideoPanel({
  video,
  onUploadAnother,
  onVideoUpdated,
  onToast,
}: {
  video: RecentVideo;
  onUploadAnother: () => void;
  onVideoUpdated: (video: RecentVideo) => void;
  onToast: (message: string) => void;
}) {
  const videoUrl = getProcessedVideoUrl(video) ?? `/api/videos/${video.id}/stream?variant=processed`;
  return (
    <div className="analysis-result-panel">
      <AnalysisVideoPlayer src={videoUrl} title={video.originalFilename} className="analysis-video-shell--dashboard" />
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
      <MatchColorEditor video={video} onSaved={onVideoUpdated} onToast={onToast} />
    </div>
  );
}

function buildBottomStats(metrics: AnalysisMetrics | null) {
  const display = getMetricDisplay(metrics);
  const ownDistanceKm = getOwnDistanceKm(metrics);
  const rivalDistanceKm = getRivalDistanceKm(metrics);
  const ownPossession = Number(display.possession) || 0;
  const rivalPossession = Number(display.rivalPossession) || 0;
  const possessionGap = Math.abs(ownPossession - rivalPossession);
  const distanceGap = Math.abs(ownDistanceKm - rivalDistanceKm);
  return [
    { label: "Posesión Eq. 1", value: display.possession, unit: "%", bar: Number(display.possession) || 0 },
    { label: "Posesión Eq. 2", value: display.rivalPossession, unit: "%", bar: Number(display.rivalPossession) || 0 },
    { label: "Dist. propio", value: formatKm(ownDistanceKm), unit: "km", bar: Math.min(100, ownDistanceKm * 10) },
    { label: "Dist. rival", value: formatKm(rivalDistanceKm), unit: "km", bar: Math.min(100, rivalDistanceKm * 10) },
    { label: "Dif. posesión", value: possessionGap.toFixed(1), unit: "pp", bar: Math.min(100, possessionGap) },
    { label: "Dif. distancia", value: formatKm(distanceGap), unit: "km", bar: Math.min(100, distanceGap * 10) },
  ];
}

function buildRadar(metrics: AnalysisMetrics | null) {
  if (!metrics) return radarFallback;
  const ownPossession = metrics.ballControl?.ownTeam ?? metrics.possession.team1Pct;
  const rivalPossession = metrics.ballControl?.rivalTeam ?? metrics.possession.team2Pct;
  const ownDistanceKm = getOwnDistanceKm(metrics);
  const rivalDistanceKm = getRivalDistanceKm(metrics);
  const totalDistance = Math.max(ownDistanceKm + rivalDistanceKm, 1);
  const ownDistanceShare = (ownDistanceKm / totalDistance) * 100;
  const rivalDistanceShare = (rivalDistanceKm / totalDistance) * 100;
  const ownDominance = weightedMetric(ownPossession, ownDistanceShare, 0.62);
  const rivalDominance = weightedMetric(rivalPossession, rivalDistanceShare, 0.62);
  const ownTempo = weightedMetric(ownDistanceShare, ownDominance, 0.58);
  const rivalTempo = weightedMetric(rivalDistanceShare, rivalDominance, 0.58);
  return [
    {
      subject: "Control",
      local: ownPossession,
      rival: rivalPossession,
      localValue: `${ownPossession.toFixed(1)}%`,
      rivalValue: `${rivalPossession.toFixed(1)}%`,
    },
    {
      subject: "Distancia",
      local: ownDistanceShare,
      rival: rivalDistanceShare,
      localValue: `${formatKm(ownDistanceKm)} km`,
      rivalValue: `${formatKm(rivalDistanceKm)} km`,
    },
    {
      subject: "Dominio",
      local: ownDominance,
      rival: rivalDominance,
      localValue: `${ownDominance.toFixed(0)}/100`,
      rivalValue: `${rivalDominance.toFixed(0)}/100`,
    },
    {
      subject: "Ritmo",
      local: ownTempo,
      rival: rivalTempo,
      localValue: `${ownTempo.toFixed(0)}/100`,
      rivalValue: `${rivalTempo.toFixed(0)}/100`,
    },
  ];
}

function GlobalRadarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey?: string; payload?: Record<string, unknown> }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload ?? {};
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <span>Equipo propio: {String(data.localValue ?? "-")}</span>
      <span>Equipo rival: {String(data.rivalValue ?? "-")}</span>
    </div>
  );
}

function getOwnDistanceKm(metrics: AnalysisMetrics | null) {
  return metrics?.distance.teams?.own.totalKm ?? (metrics?.teamDistances?.ownTeam ?? 0) / 1000;
}

function getRivalDistanceKm(metrics: AnalysisMetrics | null) {
  return metrics?.distance.teams?.rival.totalKm ?? (metrics?.teamDistances?.rivalTeam ?? 0) / 1000;
}

function weightedMetric(primary: number, secondary: number, primaryWeight: number) {
  const value = primary * primaryWeight + secondary * (1 - primaryWeight);
  return Math.max(0, Math.min(100, value));
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

function getVideoMatchInfo(video: RecentVideo | null): MatchInfo {
  const metadata = video?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const matchInfo = (metadata as { matchInfo?: unknown }).matchInfo;
  if (!matchInfo || typeof matchInfo !== "object" || Array.isArray(matchInfo)) return {};
  return matchInfo as MatchInfo;
}

function formatVideoOpponent(video: RecentVideo) {
  const matchInfo = getVideoMatchInfo(video);
  if (matchInfo.ownTeam || matchInfo.rivalTeam) {
    return `${matchInfo.ownTeam ?? "Equipo 1"} vs ${matchInfo.rivalTeam ?? "Equipo 2"}`;
  }
  return "Datos de partido";
}

function formatKm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function getStepIndex(videoStatus?: string, jobStatus?: string) {
  if (!videoStatus) return 0;
  if (videoStatus === "COMPLETED") return 5;
  if (videoStatus === "FAILED") return 4;
  if (videoStatus === "PENDING_ANALYSIS") return 1;
  if (videoStatus === "PROCESSING" || jobStatus === "RUNNING") return 2;
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




