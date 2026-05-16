"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CheckCircle2, Film, History, ScanLine, Upload } from "lucide-react";
import { AnalysisProcessingPanel } from "@/components/analysis-processing-panel";
import { type AnalysisMetrics } from "@/lib/analysis-metrics";
import { AnalysisVideoPlayer } from "@/components/analysis-video-player";
import { ToastViewport, useAppToasts } from "@/components/app-toast";
import { MatchColorEditor } from "@/components/match-color-editor";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";
import { VideoUploadDropzone, type UploadedVideo } from "@/components/video-upload-dropzone";

const Bar = dynamic(async () => (await import("recharts")).Bar, { ssr: false });
const BarChart = dynamic(async () => (await import("recharts")).BarChart, { ssr: false });
const CartesianGrid = dynamic(async () => (await import("recharts")).CartesianGrid, { ssr: false });
const Cell = dynamic(async () => (await import("recharts")).Cell, { ssr: false });
const Line = dynamic(async () => (await import("recharts")).Line, { ssr: false });
const LineChart = dynamic(async () => (await import("recharts")).LineChart, { ssr: false });
const PolarAngleAxis = dynamic(async () => (await import("recharts")).PolarAngleAxis, { ssr: false });
const PolarGrid = dynamic(async () => (await import("recharts")).PolarGrid, { ssr: false });
const PolarRadiusAxis = dynamic(async () => (await import("recharts")).PolarRadiusAxis, { ssr: false });
const Radar = dynamic(async () => (await import("recharts")).Radar, { ssr: false });
const RadarChart = dynamic(async () => (await import("recharts")).RadarChart, { ssr: false });
const ResponsiveContainer = dynamic(async () => (await import("recharts")).ResponsiveContainer, { ssr: false });
const Tooltip = dynamic(async () => (await import("recharts")).Tooltip, { ssr: false });
const XAxis = dynamic(async () => (await import("recharts")).XAxis, { ssr: false });
const YAxis = dynamic(async () => (await import("recharts")).YAxis, { ssr: false });

type RecentVideo = {
  id: string;
  originalFilename: string;
  status: string;
  durationSeconds?: number | null;
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

type TeamColorAssignment = {
  ownTeamColor: string | null;
  rivalTeamColor: string | null;
  isSwapped: boolean;
};

type MatchMetricConfig = {
  id: string;
  label: string;
  unit: string;
  valueTarget: number;
  barTarget: number;
  color?: string;
  formatValue: (value: number) => string;
};

type BottomStatConfig = {
  id: string;
  label: string;
  unit: string;
  valueTarget: number;
  barTarget: number;
  formatValue: (value: number) => string;
};

type DashboardExperienceProps = {
  videos: RecentVideo[];
  totalAnalyses: number;
  pollingEnabled?: boolean;
};

type StorageUsagePayload = {
  usedBytes: string;
  limitBytes: string;
  remainingBytes: string;
  percentUsed: number;
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

export function DashboardExperience({ videos, totalAnalyses, pollingEnabled = true }: DashboardExperienceProps) {
  const [items, setItems] = useState(videos);
  const [activeId, setActiveId] = useState(videos[0]?.id ?? "");
  const [uploadOpen, setUploadOpen] = useState(videos.length === 0);
  const [storageUsage, setStorageUsage] = useState<StorageUsagePayload | null>(null);
  const { toasts, pushToast, dismissToast } = useAppToasts();
  const selectedVideo = items.find((video) => video.id === activeId) ?? items[0] ?? null;
  const featured = uploadOpen ? null : selectedVideo;
  const metrics = featured?.latestMetrics ?? null;
  const matchInfo = getVideoMatchInfo(featured);
  const colorAssignment = useMemo(() => resolveTeamColorAssignment(matchInfo, metrics), [matchInfo, metrics]);
  const ownTeamName = metrics?.match?.ownTeam ?? matchInfo.ownTeam ?? "Equipo 1";
  const rivalTeamName = metrics?.match?.rivalTeam ?? matchInfo.rivalTeam ?? "Equipo 2";
  const rawOwnGoals = metrics?.match?.ownGoals ?? 0;
  const rawRivalGoals = metrics?.match?.rivalGoals ?? 0;
  const ownGoals = colorAssignment.isSwapped ? rawRivalGoals : rawOwnGoals;
  const rivalGoals = colorAssignment.isSwapped ? rawOwnGoals : rawRivalGoals;
  const rawOwnPossession = metrics?.ballControl?.ownTeam ?? metrics?.possession.team1Pct ?? 0;
  const rawRivalPossession = metrics?.ballControl?.rivalTeam ?? metrics?.possession.team2Pct ?? 0;
  const mappedPossession = mapByColorAssignment(rawOwnPossession, rawRivalPossession, colorAssignment.isSwapped);
  const ownPossession = mappedPossession.own;
  const rivalPossession = mappedPossession.rival;
  const rawOwnDistanceKm = getOwnDistanceKm(metrics);
  const rawRivalDistanceKm = getRivalDistanceKm(metrics);
  const mappedDistance = mapByColorAssignment(rawOwnDistanceKm, rawRivalDistanceKm, colorAssignment.isSwapped);
  const ownDistanceKm = mappedDistance.own;
  const rivalDistanceKm = mappedDistance.rival;
  const hasCompletedMetrics = Boolean(featured && featured.status === "COMPLETED" && metrics);
  const metricAnimationSeed = [
    featured?.id ?? "no-video",
    featured?.status ?? "no-status",
    featured?.updatedAt ?? "no-updated-at",
    ownTeamName,
    rivalTeamName,
    colorAssignment.ownTeamColor ?? "no-own-color",
    colorAssignment.rivalTeamColor ?? "no-rival-color",
    colorAssignment.isSwapped ? "swapped" : "normal",
    ownPossession.toFixed(3),
    rivalPossession.toFixed(3),
    ownDistanceKm.toFixed(3),
    rivalDistanceKm.toFixed(3),
  ].join("|");
  const matchMetrics: MatchMetricConfig[] = [
    {
      id: "own-control",
      label: `Control ${ownTeamName}`,
      unit: "%",
      valueTarget: ownPossession,
      barTarget: ownPossession,
      color: colorAssignment.ownTeamColor ?? undefined,
      formatValue: formatPercentMetric,
    },
    {
      id: "rival-control",
      label: `Control ${rivalTeamName}`,
      unit: "%",
      valueTarget: rivalPossession,
      barTarget: rivalPossession,
      color: colorAssignment.rivalTeamColor ?? undefined,
      formatValue: formatPercentMetric,
    },
    {
      id: "own-distance",
      label: `Dist. ${ownTeamName}`,
      unit: "km",
      valueTarget: ownDistanceKm,
      barTarget: Math.min(92, ownDistanceKm * 10),
      color: colorAssignment.ownTeamColor ?? undefined,
      formatValue: formatKm,
    },
    {
      id: "rival-distance",
      label: `Dist. ${rivalTeamName}`,
      unit: "km",
      valueTarget: rivalDistanceKm,
      barTarget: Math.min(92, rivalDistanceKm * 10),
      color: colorAssignment.rivalTeamColor ?? undefined,
      formatValue: formatKm,
    },
  ];
  const bottomStats = buildBottomStats(ownPossession, rivalPossession, ownDistanceKm, rivalDistanceKm);
  const radarData = useMemo(
    () => buildRadar(ownPossession, rivalPossession, ownDistanceKm, rivalDistanceKm),
    [ownDistanceKm, ownPossession, rivalDistanceKm, rivalPossession],
  );
  const stepIndex = getStepIndex(featured?.status, featured?.latestJob?.status);
  const activeProgress = getVideoProgress(featured);
  const hasProcessingVideo = items.some(isVideoProcessing);
  const isFeaturedProcessing = featured ? isVideoProcessing(featured) : false;
  const pollTarget = featured && isVideoProcessing(featured) ? featured : items.find(isVideoProcessing) ?? null;
  const hasNoRemainingStorage = storageUsage ? parseStorageBigInt(storageUsage.remainingBytes) <= 0n : false;
  const canUpload = !hasProcessingVideo && !hasNoRemainingStorage;
  const totalAnalysisLabel = Math.max(totalAnalyses, items.length);
  const showCompletedPanel = Boolean(featured && featured.status === "COMPLETED" && getProcessedVideoUrl(featured));
  const analysisStageState = uploadOpen ? "fresh" : isFeaturedProcessing ? "processing" : showCompletedPanel ? "completed" : "idle";

  useEffect(() => {
    if (uploadOpen) return;
    if (!featured && items[0]) {
      setActiveId(items[0].id);
    }
  }, [featured, items, uploadOpen]);

  useEffect(() => {
    void refreshStorageUsage();
  }, []);

  useEffect(() => {
    if (!pollingEnabled || !pollTarget) return;

    const eventSource = new EventSource(`/api/videos/${pollTarget.id}/events`);
    const handleVideoEvent = (event: Event) => {
      const nextVideo = JSON.parse((event as MessageEvent).data) as RecentVideo;
      setItems((current) => {
        const previous = current.find((video) => video.id === nextVideo.id);
        if (previous?.status !== "COMPLETED" && nextVideo.status === "COMPLETED") {
          pushToast("análisis terminado. El video ya está listo para revisarse.", {
            dedupeKey: `${nextVideo.id}:completed`,
            durationMs: 8500,
            sound: true,
          });
          pushCompletionStorageToast(nextVideo, pushToast);
          void refreshStorageUsage();
        }
        return current.map((video) => (video.id === nextVideo.id ? nextVideo : video));
      });
      if (nextVideo.status === "COMPLETED" || nextVideo.status === "FAILED") {
        setActiveId(nextVideo.id);
        eventSource.close();
      }
    };
    const handleError = () => {
      eventSource.close();
      void refreshVideo(pollTarget.id);
    };
    eventSource.addEventListener("video", handleVideoEvent);
    eventSource.addEventListener("error", handleError);

    return () => {
      eventSource.removeEventListener("video", handleVideoEvent);
      eventSource.removeEventListener("error", handleError);
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
    void refreshStorageUsage();
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
        pushCompletionStorageToast(data.video!, pushToast);
        void refreshStorageUsage();
      }
      return current.map((video) => (video.id === data.video!.id ? data.video! : video));
    });
  }

  function openUploader() {
    if (!canUpload) return;
    setActiveId("");
    setUploadOpen(true);
  }

  async function refreshStorageUsage() {
    const response = await fetch("/api/storage/usage", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json().catch(() => null)) as StorageUsagePayload | null;
    if (!payload) return;
    setStorageUsage(payload);
  }

  return (
    <div className="dashboard-lab dashboard-lab--figma">
      <section className="dashboard-command dashboard-command--hero">
        <MicroGrid />
        <div className="dashboard-command__copy">
          <AnnotationLine label="módulo de análisis" value="" />
          <h1>
            Dashboard <span>de análisis</span>
          </h1>
        </div>
        <div className="dashboard-command__status-anchor" aria-live="polite">
          <div className="live-chip dashboard-command__status">
            <span />
            {featured ? formatStatus(featured.status) : "En espera"}
          </div>
        </div>
      </section>

      <section className="analysis-console" aria-label="Consola de análisis">
        <div className="analysis-console__stage" data-analysis-state={analysisStageState}>
          <CornerMarks size={14} opacity={0.45} />
          <div className="video-radar video-radar--upload" data-analysis-state={analysisStageState}>
            {isFeaturedProcessing ? (
              <AnalysisProcessingPanel
                filename={featured?.originalFilename ?? "Video en análisis"}
                progress={activeProgress}
                note="Subir otro video está bloqueado hasta terminar el tracking y la generación del video anotado."
              />
            ) : featured?.status === "FAILED" ? (
              <AnalysisProcessingPanel
                variant="failed"
                filename={featured.originalFilename}
                note={featured.latestJob?.error || "El análisis se interrumpió antes de generar el video anotado."}
                actionLabel="Reintentar análisis"
                onAction={() => {
                  window.location.href = "/dashboard/videos";
                }}
              />
            ) : featured?.status === "COMPLETED" && !uploadOpen ? (
              getProcessedVideoUrl(featured) ? (
                <AnalyzedVideoPanel
                  video={featured}
                  onStreamError={(message) => pushToast(message, { tone: "warning", durationMs: 9000 })}
                  onUploadAnother={openUploader}
                  onColorSaved={(video) => {
                    setItems((current) => current.map((item) => (item.id === video.id ? video : item)));
                  }}
                  onColorToast={(message) => pushToast(message, { durationMs: 7000, sound: true })}
                  stepIndex={stepIndex}
                />
              ) : (
                <MissingProcessedOutputPanel video={featured} onUploadAnother={openUploader} />
              )
            ) : (
              <VideoUploadDropzone
                onUploaded={handleUploaded}
                onNotify={(message, tone = "info") => pushToast(message, { tone, durationMs: 9000 })}
                disabled={!canUpload}
                disabledMessage={hasNoRemainingStorage ? "You have reached your storage limit." : `Analizando video... (${activeProgress}%)`}
                progress={hasProcessingVideo ? activeProgress : undefined}
                label={items.length ? "Analizar otro partido" : "Selecciona o arrastra un partido"}
                description={items.length ? "El resultado anterior queda guardado en historial." : "MP4, MOV, AVI o formatos compatibles con el pipeline."}
              />
            )}
          </div>

          {!showCompletedPanel ? (
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
          ) : null}

        </div>

        {!uploadOpen ? (
        <aside className="match-panel">
          <CornerMarks size={12} opacity={0.35} />
          <div className="score-card" title={`${ownTeamName}: ${ownPossession.toFixed(1)}% / ${rivalTeamName}: ${rivalPossession.toFixed(1)}%`}>
            <div>
              <span className="score-card__team-label">
                {colorAssignment.ownTeamColor ? <i style={{ background: colorAssignment.ownTeamColor }} /> : null}
                {ownTeamName}
              </span>
              <strong>{ownPossession.toFixed(1)}%</strong>
            </div>
            <div className="score-card__score">
              <b>{ownGoals}</b>
              <span>/</span>
              <b>{rivalGoals}</b>
            </div>
            <div>
              <span className="score-card__team-label">
                {colorAssignment.rivalTeamColor ? <i style={{ background: colorAssignment.rivalTeamColor }} /> : null}
                {rivalTeamName}
              </span>
              <strong>{rivalPossession.toFixed(1)}%</strong>
            </div>
          </div>

          <div className="player-stat-list">
            <h2>Métricas del partido</h2>
            {matchMetrics.map((metric) => (
              <AnimatedMatchMetric
                key={metric.id}
                animationKey={`${metricAnimationSeed}|player|${metric.id}|${metric.valueTarget.toFixed(3)}|${metric.barTarget.toFixed(3)}|${metric.color ?? "default"}`}
                isLoading={!hasCompletedMetrics}
                metric={metric}
                statusLabel={featured ? formatStatus(featured.status) : "sin video"}
              />
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
        ) : null}
      </section>

      {!uploadOpen ? (
      <section className="stat-strip" aria-label="métricas del partido">
        {bottomStats.map((stat, index) => (
          <AnimatedBottomStat
            key={stat.id}
            animationKey={`${metricAnimationSeed}|strip|${stat.id}|${stat.valueTarget.toFixed(3)}|${stat.barTarget.toFixed(3)}`}
            index={index}
            isLoading={!hasCompletedMetrics}
            stat={stat}
          />
        ))}
      </section>
      ) : null}

      {!uploadOpen ? (
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
                {zoneData.map((zoneItem, index) => (
                  <Cell key={zoneItem.zone} fill={`rgba(255,107,43,${0.25 + index * 0.16})`} stroke="#ff6b2b" strokeWidth={0.5} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel chart-panel--field">
          <h2>Mapa del modelo</h2>
          <svg fill="none" aria-hidden="true" viewBox="0 0 240 130"><defs><radialGradient id="heat-hot" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(255,146,67,0.9)"/><stop offset="35%" stopColor="rgba(244,223,72,0.78)"/><stop offset="62%" stopColor="rgba(117,241,77,0.58)"/><stop offset="100%" stopColor="rgba(33,110,255,0)"/></radialGradient><filter id="heat-blur"><feGaussianBlur stdDeviation="7"/></filter></defs><path stroke="rgba(255,107,43,0.24)" strokeWidth=".75" d="M2 2h236v126H2z"/><path stroke="rgba(255,255,255,0.25)" strokeWidth=".75" d="M120 2v126"/><circle cx="120" cy="65" r="20" stroke="rgba(255,255,255,0.24)" strokeWidth=".75"/><path stroke="rgba(255,255,255,0.22)" strokeWidth=".75" d="M2 44h38v42H2zm198 0h38v42h-38z"/><g fill="url(#heat-hot)" filter="url(#heat-blur)"><circle cx="55" cy="40" r="24"/><circle cx="80" cy="95" r="30"/><circle cx="105" cy="58" r="20"/><circle cx="140" cy="70" r="22"/><circle cx="165" cy="40" r="18"/><circle cx="186" cy="88" r="16"/></g><path fill="url(#heat-hot)" d="M2 2h236v126H2z" opacity=".08"/></svg>
        </article>
      </section>
      ) : null}

      <section className="recent-videos lab-panel">
        <div className="panel-heading recent-videos__heading">
          <div>
            <div className="recent-videos__eyebrow">
              <span>Archivo</span>
              <span className="recent-videos__eyebrow-line" aria-hidden="true" />
              <span>Partidos analizados</span>
            </div>
            <h2>
              Historial <em>de videos</em>
            </h2>
          </div>
          <Link href="/dashboard/videos" className="text-command">
            <History size={13} />
            {totalAnalysisLabel} análisis
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <ScanLine size={24} />
            <strong>No hay videos registrados todavía.</strong>
            <span>Sube tu primer partido desde la consola central.</span>
          </div>
        ) : (
          <div className="video-list recent-videos__grid">
            {items.slice(0, 4).map((video) => {
              return (
                <article
                  className={`video-row video-row--shell ${video.id === featured?.id ? "is-selected" : ""}`}
                  key={video.id}
                >
                  <button
                    className="video-row__select"
                    type="button"
                    onClick={() => {
                      setActiveId(video.id);
                      setUploadOpen(false);
                    }}
                  >
                    <span className="video-row__icon">
                      <Film size={17} />
                    </span>
                    <div className="video-row__body">
                      <strong className="video-row__title" title={video.originalFilename}>
                        {video.originalFilename}
                      </strong>
                      <span className="video-row__description" title={formatVideoOpponent(video)}>
                        {formatVideoOpponent(video)}
                      </span>
                      <span className="video-row__meta-inline">
                        <span>Fecha de subida: {formatDate(video.createdAt)}</span>
                      </span>
                      <span className="video-row__meta-inline">
                        <span>Duración: {getVideoDurationLabel(video)}</span>
                      </span>
                    </div>
                    <span className="video-row__status-group">
                      <span className="video-row__status-label">Estado</span>
                      <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
                    </span>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function AnimatedMetricBar({
  percent,
  color,
  reducedMotion,
  isLoading = false,
}: {
  percent: number;
  color?: string;
  reducedMotion?: boolean;
  isLoading?: boolean;
}) {
  const displayPercent = isLoading ? 0 : Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));

  return (
    <span className={`meter ${isLoading ? "meter--loading" : ""}`} aria-hidden="true">
      <span
        className="meter__fill"
        style={{
          width: `${displayPercent}%`,
          background: color ?? undefined,
          transition: reducedMotion ? undefined : "none",
        }}
      />
    </span>
  );
}

function AnimatedMatchMetric({
  metric,
  statusLabel,
  animationKey,
  isLoading,
}: {
  metric: MatchMetricConfig;
  statusLabel: string;
  animationKey: string;
  isLoading: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const { animatedValue, animatedBar } = useAnimatedMetricDisplay({
    animationKey,
    isLoading,
    reducedMotion,
    targetValue: metric.valueTarget,
    targetBar: metric.barTarget,
  });
  const displayValue = metric.formatValue(animatedValue);

  return (
    <article className="player-stat" title={`${metric.label}: ${displayValue}${metric.unit}`} aria-label={`${metric.label}: ${displayValue}${metric.unit}`}>
      <div>
        <span>{metric.label}</span>
        <small>{statusLabel}</small>
      </div>
      <strong>
        {displayValue}
        {metric.unit ? <small>{metric.unit}</small> : null}
      </strong>
      <AnimatedMetricBar color={metric.color} isLoading={isLoading} percent={animatedBar} reducedMotion={reducedMotion} />
    </article>
  );
}

function AnimatedBottomStat({
  stat,
  index,
  animationKey,
  isLoading,
}: {
  stat: BottomStatConfig;
  index: number;
  animationKey: string;
  isLoading: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const { animatedValue, animatedBar } = useAnimatedMetricDisplay({
    animationKey,
    isLoading,
    reducedMotion,
    targetValue: stat.valueTarget,
    targetBar: stat.barTarget,
  });
  const displayValue = stat.formatValue(animatedValue);

  return (
    <article className="stat-cell" title={`${stat.label}: ${displayValue}${stat.unit}`} aria-label={`${stat.label}: ${displayValue}${stat.unit}`}>
      <span>{stat.label}</span>
      <strong>
        {displayValue}
        <small>{stat.unit}</small>
      </strong>
      <AnimatedMetricBar isLoading={isLoading} percent={animatedBar} reducedMotion={reducedMotion} />
      <b>{String(index + 1).padStart(2, "0")}</b>
    </article>
  );
}

function useAnimatedMetricDisplay({
  targetValue,
  targetBar,
  animationKey,
  isLoading,
  reducedMotion,
}: {
  targetValue: number;
  targetBar: number;
  animationKey: string;
  isLoading: boolean;
  reducedMotion: boolean;
}) {
  const safeValue = Math.max(0, Number.isFinite(targetValue) ? targetValue : 0);
  const safeBar = Math.max(0, Math.min(100, Number.isFinite(targetBar) ? targetBar : 0));
  const [state, setState] = useState<{ animatedValue: number; animatedBar: number }>({ animatedValue: 0, animatedBar: 0 });

  useEffect(() => {
    if (isLoading) {
      setState({ animatedValue: 0, animatedBar: 0 });
      return;
    }

    if (reducedMotion) {
      setState({ animatedValue: safeValue, animatedBar: safeBar });
      return;
    }

    const durationMs = 1100;
    const start = performance.now();
    let frame = 0;

    setState({ animatedValue: 0, animatedBar: 0 });

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setState({
        animatedValue: safeValue * eased,
        animatedBar: safeBar * eased,
      });
      if (t < 1) {
        frame = window.requestAnimationFrame(step);
      }
    };

    frame = window.requestAnimationFrame(step);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [animationKey, isLoading, reducedMotion, safeBar, safeValue]);

  return state;
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }

    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  return reducedMotion;
}

function AnalyzedVideoPanel({
  video,
  onUploadAnother,
  onStreamError,
  onColorSaved,
  onColorToast,
  stepIndex,
}: {
  video: RecentVideo;
  onUploadAnother: () => void;
  onStreamError: (message: string) => void;
  onColorSaved: (video: RecentVideo) => void;
  onColorToast: (message: string) => void;
  stepIndex: number;
}) {
  const videoUrl = getProcessedVideoUrl(video) ?? `/api/videos/${video.id}/stream?variant=processed`;
  return (
    <div className="analysis-result-panel">
      <div className="analysis-result-panel__header">
        <div className="analysis-result-panel__header-copy">
          <span>Resultado listo</span>
          <strong>{video.originalFilename}</strong>
        </div>
        <div className="analysis-result-panel__header-actions">
          <MatchColorEditor
            mode="header"
            video={video}
            onSaved={onColorSaved}
            onToast={onColorToast}
          />
          <button className="button primary command-button analysis-result-panel__header-cta" type="button" onClick={onUploadAnother}>
            <Upload size={14} />
            Analizar otro partido
          </button>
        </div>
      </div>
      <AnalysisVideoPlayer
        src={videoUrl}
        title={video.originalFilename}
        className="analysis-video-shell--dashboard"
        onStreamError={onStreamError}
      />
      <div className="analysis-steps analysis-steps--inline">
        {analysisSteps.map((step, index) => (
          <div className="analysis-step" key={`inline-${step}`}>
            <span className={index < stepIndex ? "is-complete" : index === stepIndex ? "is-active" : ""}>
              {index < stepIndex ? <CheckCircle2 size={9} /> : null}
            </span>
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function MissingProcessedOutputPanel({ video, onUploadAnother }: { video: RecentVideo; onUploadAnother: () => void }) {
  const warning = getProcessedMissingWarning(video);
  return (
    <div className="analysis-result-panel analysis-result-panel--processing">
      <MicroGrid />
      <div className="analysis-result-panel__inner">
        <span className="analysis-upload__icon">
          <Film size={30} />
        </span>
        <div>
          <strong>{video.originalFilename}</strong>
          <small>{warning}</small>
        </div>
        <button className="button ghost command-button" type="button" onClick={onUploadAnother}>
          <Upload size={14} />
          Analizar otro partido
        </button>
      </div>
    </div>
  );
}

function buildBottomStats(ownPossession: number, rivalPossession: number, ownDistanceKm: number, rivalDistanceKm: number): BottomStatConfig[] {
  const possessionGap = Math.abs(ownPossession - rivalPossession);
  const distanceGap = Math.abs(ownDistanceKm - rivalDistanceKm);
  return [
    {
      id: "strip-own-possession",
      label: "Posesión Eq. 1",
      unit: "%",
      valueTarget: ownPossession,
      barTarget: ownPossession || 0,
      formatValue: formatPercentMetric,
    },
    {
      id: "strip-rival-possession",
      label: "Posesión Eq. 2",
      unit: "%",
      valueTarget: rivalPossession,
      barTarget: rivalPossession || 0,
      formatValue: formatPercentMetric,
    },
    {
      id: "strip-own-distance",
      label: "Dist. propio",
      unit: "km",
      valueTarget: ownDistanceKm,
      barTarget: Math.min(100, ownDistanceKm * 10),
      formatValue: formatKm,
    },
    {
      id: "strip-rival-distance",
      label: "Dist. rival",
      unit: "km",
      valueTarget: rivalDistanceKm,
      barTarget: Math.min(100, rivalDistanceKm * 10),
      formatValue: formatKm,
    },
    {
      id: "strip-possession-gap",
      label: "Dif. posesión",
      unit: "pp",
      valueTarget: possessionGap,
      barTarget: Math.min(100, possessionGap),
      formatValue: formatPercentMetric,
    },
    {
      id: "strip-distance-gap",
      label: "Dif. distancia",
      unit: "km",
      valueTarget: distanceGap,
      barTarget: Math.min(100, distanceGap * 10),
      formatValue: formatKm,
    },
  ];
}

function buildRadar(ownPossession: number, rivalPossession: number, ownDistanceKm: number, rivalDistanceKm: number) {
  if (!Number.isFinite(ownPossession) || !Number.isFinite(rivalPossession)) return radarFallback;
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

function resolveTeamColorAssignment(matchInfo: MatchInfo, metrics: AnalysisMetrics | null): TeamColorAssignment {
  const detectedOwn = normalizeHex(metrics?.match?.detectedTeamColors?.team1);
  const detectedRival = normalizeHex(metrics?.match?.detectedTeamColors?.team2);
  const configuredOwn = normalizeHex(matchInfo.ownTeamColor);
  const configuredRival = normalizeHex(matchInfo.rivalTeamColor);

  if (configuredOwn && configuredRival && detectedOwn && detectedRival) {
    if (configuredOwn === detectedRival && configuredRival === detectedOwn) {
      return { ownTeamColor: configuredOwn, rivalTeamColor: configuredRival, isSwapped: true };
    }
    return { ownTeamColor: configuredOwn, rivalTeamColor: configuredRival, isSwapped: false };
  }

  if (configuredOwn && configuredRival) {
    return { ownTeamColor: configuredOwn, rivalTeamColor: configuredRival, isSwapped: false };
  }

  if (detectedOwn && detectedRival) {
    return { ownTeamColor: detectedOwn, rivalTeamColor: detectedRival, isSwapped: false };
  }

  return {
    ownTeamColor: normalizeHex(metrics?.match?.ownTeamColor) ?? null,
    rivalTeamColor: normalizeHex(metrics?.match?.rivalTeamColor) ?? null,
    isSwapped: false,
  };
}

function normalizeHex(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function mapByColorAssignment(ownValue: number, rivalValue: number, isSwapped: boolean) {
  if (!isSwapped) return { own: ownValue, rival: rivalValue };
  return { own: rivalValue, rival: ownValue };
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

function getVideoDurationLabel(video: RecentVideo) {
  const totalSeconds = typeof video.durationSeconds === "number" && Number.isFinite(video.durationSeconds)
    ? Math.max(0, Math.round(video.durationSeconds))
    : null;
  if (totalSeconds === null) return "--:--";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getStorageLabels(video: RecentVideo) {
  const metadata = getVideoMetadata(video);
  const labels: string[] = [];

  if (metadata.storageMode === "s3") labels.push("Original: R2");
  if (metadata.storageMode === "local") labels.push("Original: Local");

  if (typeof metadata.processedObjectKey === "string" || typeof metadata.annotatedObjectKey === "string") {
    labels.push("Processed: R2");
  } else if (typeof metadata.processedLocalPath === "string" || typeof metadata.annotatedLocalPath === "string") {
    labels.push("Processed: Local");
  } else if (video.status === "COMPLETED") {
    labels.push("Processed: Missing");
  }

  return labels;
}

function getProcessedMissingWarning(video: RecentVideo) {
  const metadata = getVideoMetadata(video);
  const warnings = getResilienceWarnings(video);
  const hasProcessedRemote = typeof metadata.processedObjectKey === "string" || typeof metadata.annotatedObjectKey === "string";
  const hasProcessedLocal = typeof metadata.processedLocalPath === "string" || typeof metadata.annotatedLocalPath === "string";
  if (warnings.includes("PROCESSED_VIDEO_MISSING")) return "Video file missing.";
  if (video.status !== "COMPLETED") return "";
  return hasProcessedRemote || hasProcessedLocal ? "" : "No se encontró la ubicación del video procesado.";
}

function getResilienceWarnings(video: RecentVideo) {
  const metadata = getVideoMetadata(video);
  const raw = metadata.resilienceWarnings;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function getVideoMetadata(video: RecentVideo) {
  if (!video.metadata || typeof video.metadata !== "object" || Array.isArray(video.metadata)) {
    return {} as Record<string, unknown>;
  }
  return video.metadata as Record<string, unknown>;
}

function pushCompletionStorageToast(
  video: RecentVideo,
  pushToast: (message: string, options?: { tone?: "success" | "info" | "warning"; durationMs?: number; dedupeKey?: string; sound?: boolean }) => void,
) {
  const warning = getProcessedMissingWarning(video);
  if (warning) {
    pushToast("Análisis finalizado, pero el video no está guardado en la nube.", {
      tone: "warning",
      dedupeKey: `${video.id}:processed-missing`,
      durationMs: 9000,
    });
    return;
  }

  const labels = getStorageLabels(video);
  if (labels.includes("Processed: R2")) {
    pushToast("Análisis completado. Video guardado en el dispositivo.", {
      tone: "success",
      dedupeKey: `${video.id}:processed-r2`,
      durationMs: 9000,
    });
  } else if (labels.includes("Processed: Local")) {
    pushToast("Análisis completado. Video guardado en el dispositivo.", {
      tone: "warning",
      dedupeKey: `${video.id}:processed-local`,
      durationMs: 9000,
    });
  }
}

function formatKm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatPercentMetric(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toFixed(1);
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

function parseStorageBigInt(value: string) {
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function formatStorageBytes(value: string) {
  const bytes = Number(parseStorageBigInt(value));
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}



