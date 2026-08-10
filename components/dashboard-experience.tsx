"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { CheckCircle2, Film, History, ScanLine, Upload } from "lucide-react";
import { AnalysisProcessingPanel } from "@/components/analysis-processing-panel";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { type AnalysisMetrics } from "@/lib/analysis-metrics";
import { AnalysisVideoPlayer } from "@/components/analysis-video-player";
import { ToastViewport, useAppToasts } from "@/components/app-toast";
import { MatchColorEditor } from "@/components/match-color-editor";
import { AnnotationLine, CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";
import { ReportDownloadButton, type ReportToastOptions } from "@/components/report-download-button";
import { usePrefersReducedMotion } from "@/components/use-prefers-reduced-motion";
import { VideoEventSubscription } from "@/components/video-event-subscription";
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
    cancelled?: boolean;
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

type AnimatedMetricState = {
  animatedValue: number;
  animatedBar: number;
};

type AnimatedMetricAction = {
  type: "set";
  value: number;
  bar: number;
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

function animatedMetricReducer(_state: AnimatedMetricState, action: AnimatedMetricAction): AnimatedMetricState {
  return {
    animatedValue: action.value,
    animatedBar: action.bar,
  };
}

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

const videoDateFormatters = {
  es: new Intl.DateTimeFormat("es-CR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
};

const analysisStepsByLocale = {
  es: ["Subida validada", "Cola IA", "Tracking YOLO", "Métricas", "Reporte"],
  en: ["Upload validated", "AI queue", "YOLO tracking", "Metrics", "Report"],
} as const;

export function DashboardExperience({ videos, totalAnalyses, pollingEnabled = true }: DashboardExperienceProps) {
  const { locale } = useAppPreferences();
  const [items, setItems] = useState(() => videos);
  const [activeId, setActiveId] = useState(videos[0]?.id ?? "");
  const [uploadOpen, setUploadOpen] = useState(videos.length === 0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [storageUsage, setStorageUsage] = useState<StorageUsagePayload | null>(null);
  const { toasts, pushToast, dismissToast } = useAppToasts();
  const selectedVideo = items.find((video) => video.id === activeId) ?? items[0] ?? null;
  const featured = uploadOpen ? null : selectedVideo;
  const metrics = featured?.latestMetrics ?? null;
  const matchInfo = getVideoMatchInfo(featured);
  const colorAssignment = useMemo(() => resolveTeamColorAssignment(matchInfo, metrics), [matchInfo, metrics]);
  const ownTeamName = metrics?.match?.ownTeam ?? matchInfo.ownTeam ?? (locale === "en" ? "Team 1" : "Equipo 1");
  const rivalTeamName = metrics?.match?.rivalTeam ?? matchInfo.rivalTeam ?? (locale === "en" ? "Team 2" : "Equipo 2");
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
  const bottomStats = buildBottomStats(ownPossession, rivalPossession, ownDistanceKm, rivalDistanceKm, locale);
  const radarData = useMemo(
    () => buildRadar(ownPossession, rivalPossession, ownDistanceKm, rivalDistanceKm, locale),
    [locale, ownDistanceKm, ownPossession, rivalDistanceKm, rivalPossession],
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
  const analysisSteps = analysisStepsByLocale[locale];

  useEffect(() => {
    void refreshStorageUsage();
  }, []);

  function handleUploaded(video: UploadedVideo) {
    setItems((current) => [video as RecentVideo, ...current.filter((item) => item.id !== video.id)]);
    setActiveId(video.id);
    setUploadOpen(false);
    pushToast(locale === "en" ? "Video received. Starting analysis." : "Video recibido. Iniciando análisis.", {
      dedupeKey: `${video.id}:queued`,
      durationMs: 7000,
      sound: true,
    });
    void refreshStorageUsage();
  }

  async function refreshVideo(videoId: string) {
    const response = await fetch(`/api/videos/${videoId}`, { method: "GET", cache: "no-store" });
    if (!response.ok) return;
    const data = (await response.json().catch(() => ({}))) as { video?: RecentVideo };
    if (!data.video) return;
    const previous = items.find((video) => video.id === data.video!.id);
    if (previous?.status !== "COMPLETED" && data.video.status === "COMPLETED") {
      pushToast(locale === "en" ? "Analysis complete. The video is ready to review." : "Análisis terminado. El video ya está listo para revisarse.", {
        dedupeKey: `${data.video.id}:completed`,
        durationMs: 8500,
        sound: true,
      });
      pushCompletionStorageToast(data.video, pushToast, locale);
      void refreshStorageUsage();
    }
    setItems((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
  }

  function receiveVideoEvent(nextVideo: RecentVideo) {
    const previous = items.find((video) => video.id === nextVideo.id);
    if (previous?.status !== "COMPLETED" && nextVideo.status === "COMPLETED") {
      pushToast(locale === "en" ? "Analysis complete. The video is ready to review." : "Análisis terminado. El video ya está listo para revisarse.", {
        dedupeKey: `${nextVideo.id}:completed`,
        durationMs: 8500,
        sound: true,
      });
      pushCompletionStorageToast(nextVideo, pushToast, locale);
      void refreshStorageUsage();
    }
    setItems((current) => current.map((video) => (video.id === nextVideo.id ? nextVideo : video)));
    if (nextVideo.status === "COMPLETED" || nextVideo.status === "FAILED") {
      setActiveId(nextVideo.id);
    }
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

  async function cancelAnalysis(videoId: string) {
    if (cancellingId) return;
    setCancellingId(videoId);
    const response = await fetch(`/api/videos/${videoId}/analysis/cancel`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { video?: RecentVideo; error?: string } | undefined;
    setCancellingId(null);

    if (!response?.ok || !data?.video) {
      pushToast(data?.error || (locale === "en" ? "The analysis could not be cancelled." : "No se pudo cancelar el análisis."), { tone: "warning", durationMs: 8000 });
      return;
    }

    setItems((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
    setActiveId(data.video.id);
    pushToast(locale === "en" ? "Analysis cancelled. The original video was preserved." : "Análisis cancelado. El video original se conserva.", {
      dedupeKey: `${data.video.id}:cancelled`,
      durationMs: 8000,
      sound: true,
    });
  }

  return (
    <div className="dashboard-lab dashboard-lab--figma">
      {pollingEnabled && pollTarget ? (
        <VideoEventSubscription
          key={pollTarget.id}
          videoId={pollTarget.id}
          onVideo={receiveVideoEvent}
          onError={() => void refreshVideo(pollTarget.id)}
        />
      ) : null}
      <section className="dashboard-command dashboard-command--hero">
        <MicroGrid />
        <div className="dashboard-command__copy">
          <AnnotationLine label={locale === "en" ? "analysis module" : "módulo de análisis"} value="" />
          <h1>
            Dashboard <span>{locale === "en" ? "analysis" : "de análisis"}</span>
          </h1>
        </div>
        <div className="dashboard-command__status-anchor" aria-live="polite">
          <div className="live-chip dashboard-command__status">
            <span />
            {featured ? getVideoStatusLabel(featured, locale) : locale === "en" ? "Waiting" : "En espera"}
          </div>
        </div>
      </section>

      <section className="analysis-console" aria-label={locale === "en" ? "Analysis console" : "Consola de análisis"}>
        <div className="analysis-console__stage" data-analysis-state={analysisStageState}>
          <CornerMarks size={14} opacity={0.45} />
          <div className="video-radar video-radar--upload" data-analysis-state={analysisStageState}>
            {isFeaturedProcessing ? (
              <AnalysisProcessingPanel
                filename={featured?.originalFilename ?? (locale === "en" ? "Video under analysis" : "Video en análisis")}
                progress={activeProgress}
                note={locale === "en" ? "You can cancel the analysis without deleting the original video." : "Puedes cancelar el análisis sin eliminar el video original."}
                actionLabel={cancellingId === featured?.id ? (locale === "en" ? "Cancelling..." : "Cancelando...") : (locale === "en" ? "Cancel analysis" : "Cancelar análisis")}
                onAction={featured && !cancellingId ? () => void cancelAnalysis(featured.id) : undefined}
                actionDisabled={Boolean(cancellingId)}
              />
            ) : featured && isVideoFailed(featured) ? (
              <AnalysisProcessingPanel
                variant="failed"
                title={featured.latestJob?.cancelled ? (locale === "en" ? "Analysis cancelled" : "Análisis cancelado") : undefined}
                filename={featured.originalFilename}
                note={
                  featured.latestJob?.cancelled
                    ? (locale === "en" ? "The original video is preserved. You can retry from history." : "El video original se conserva. Puedes reintentar el análisis desde el historial.")
                    : featured.latestJob?.error || (locale === "en" ? "The analysis stopped before generating the annotated video." : "El análisis se interrumpió antes de generar el video anotado.")
                }
                actionLabel={featured.latestJob?.cancelled ? (locale === "en" ? "Analyze another match" : "Analizar otro partido") : (locale === "en" ? "Retry analysis" : "Reintentar análisis")}
                onAction={() => {
                  if (featured.latestJob?.cancelled) {
                    openUploader();
                    return;
                  }
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
                  onReportToast={pushToast}
                  stepIndex={stepIndex}
                />
              ) : (
                <MissingProcessedOutputPanel video={featured} onReportToast={pushToast} onUploadAnother={openUploader} />
              )
            ) : (
              <VideoUploadDropzone
                onUploaded={handleUploaded}
                onNotify={(message, tone = "info") => pushToast(message, { tone, durationMs: 9000 })}
                disabled={!canUpload}
                disabledMessage={
                  hasNoRemainingStorage
                      ? (locale === "en" ? "You have reached your storage limit." : "Alcanzaste tu límite de almacenamiento.")
                    : activeProgress === 0
                      ? (locale === "en" ? "Waiting for worker..." : "Esperando worker...")
                      : `${locale === "en" ? "Analyzing video" : "Analizando video"}... (${activeProgress}%)`
                }
                progress={hasProcessingVideo ? activeProgress : undefined}
                label={items.length ? (locale === "en" ? "Analyze another match" : "Analizar otro partido") : (locale === "en" ? "Select or drop a match" : "Selecciona o arrastra un partido")}
                description={items.length ? (locale === "en" ? "The previous result remains saved in history." : "El resultado anterior queda guardado en historial.") : (locale === "en" ? "MP4, MOV, AVI, or formats supported by the pipeline." : "MP4, MOV, AVI o formatos compatibles con el pipeline.")}
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
          <DashboardInsights
            featured={featured}
            ownTeamName={ownTeamName}
            rivalTeamName={rivalTeamName}
            ownGoals={ownGoals}
            rivalGoals={rivalGoals}
            ownPossession={ownPossession}
            rivalPossession={rivalPossession}
            colorAssignment={colorAssignment}
            matchMetrics={matchMetrics}
            metricAnimationSeed={metricAnimationSeed}
            hasCompletedMetrics={hasCompletedMetrics}
            radarData={radarData}
          />
        ) : null}
      </section>

      {!uploadOpen ? (
        <DashboardCharts
          bottomStats={bottomStats}
          metricAnimationSeed={metricAnimationSeed}
          hasCompletedMetrics={hasCompletedMetrics}
        />
      ) : null}

      <DashboardRecentVideos
        items={items}
        featuredId={featured?.id ?? null}
        totalAnalysisLabel={totalAnalysisLabel}
        onSelect={(videoId) => {
          setActiveId(videoId);
          setUploadOpen(false);
        }}
      />

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

type DashboardInsightsProps = {
  featured: RecentVideo | null;
  ownTeamName: string;
  rivalTeamName: string;
  ownGoals: number;
  rivalGoals: number;
  ownPossession: number;
  rivalPossession: number;
  colorAssignment: TeamColorAssignment;
  matchMetrics: MatchMetricConfig[];
  metricAnimationSeed: string;
  hasCompletedMetrics: boolean;
  radarData: ReturnType<typeof buildRadar>;
};

function DashboardInsights({
  featured,
  ownTeamName,
  rivalTeamName,
  ownGoals,
  rivalGoals,
  ownPossession,
  rivalPossession,
  colorAssignment,
  matchMetrics,
  metricAnimationSeed,
  hasCompletedMetrics,
  radarData,
}: DashboardInsightsProps) {
  const { locale, theme } = useAppPreferences();
  const chartTextColor = theme === "light" ? "rgba(36,27,23,0.62)" : "rgba(255,255,255,0.34)";
  const rivalChartColor = theme === "light" ? "rgba(36,27,23,0.36)" : "rgba(255,255,255,0.26)";

  return (
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
        <h2>{locale === "en" ? "Match metrics" : "Métricas del partido"}</h2>
        {matchMetrics.map((metric) => (
          <AnimatedMatchMetric
            key={metric.id}
            animationKey={`${metricAnimationSeed}|player|${metric.id}|${metric.valueTarget.toFixed(3)}|${metric.barTarget.toFixed(3)}|${metric.color ?? "default"}`}
            isLoading={!hasCompletedMetrics}
            metric={metric}
            statusLabel={featured ? getVideoStatusLabel(featured, locale) : locale === "en" ? "no video" : "sin video"}
          />
        ))}
      </div>

      <div className="radar-card">
        <h2>{locale === "en" ? "Overall performance" : "Rendimiento global"}</h2>
        <ResponsiveContainer width="100%" height={170}>
          <RadarChart data={radarData}>
            <PolarGrid stroke={theme === "light" ? "rgba(173,70,27,0.3)" : "rgba(255,107,43,0.16)"} strokeDasharray="3 3" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: chartTextColor, fontSize: 8 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
            <Radar dataKey="local" stroke="#ff6b2b" strokeWidth={theme === "light" ? 2.4 : 1.8} fill="#ff6b2b" fillOpacity={theme === "light" ? 0.18 : 0.12} />
            <Radar dataKey="rival" stroke={rivalChartColor} strokeWidth={theme === "light" ? 1.6 : 1} fill="none" />
            <Tooltip content={<GlobalRadarTooltip />} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </aside>
  );
}

function DashboardCharts({
  bottomStats,
  metricAnimationSeed,
  hasCompletedMetrics,
}: {
  bottomStats: BottomStatConfig[];
  metricAnimationSeed: string;
  hasCompletedMetrics: boolean;
}) {
  const { locale, theme } = useAppPreferences();
  const chartTextColor = theme === "light" ? "rgba(36,27,23,0.58)" : "rgba(255,255,255,0.28)";
  const chartAxisColor = theme === "light" ? "rgba(36,27,23,0.44)" : "rgba(255,255,255,0.2)";
  const chartGridColor = theme === "light" ? "rgba(173,70,27,0.22)" : "rgba(255,107,43,0.1)";
  const chartAccent = theme === "light" ? "#d94f16" : "#ff6b2b";
  const tooltipStyle = theme === "light"
    ? { background: "#ffffff", border: "1px solid rgba(173,70,27,0.34)", color: "#241b17" }
    : { background: "#0b0b0b", border: "1px solid rgba(255,107,43,0.25)", color: "#f2f0ee" };

  return (
    <>
      <section className="stat-strip" aria-label={locale === "en" ? "match metrics" : "métricas del partido"}>
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

      <section className="chart-grid">
        <article className="chart-panel chart-panel--wide">
          <Crosshair className="chart-crosshair" size={15} opacity={0.16} />
          <h2>{locale === "en" ? "Detection intensity" : "Intensidad de detección"}</h2>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={intensityData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" />
              <XAxis dataKey="minute" tick={{ fill: chartTextColor, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartAxisColor, fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ stroke: "rgba(255,107,43,0.2)" }} contentStyle={tooltipStyle} />
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartAccent}
                strokeWidth={theme === "light" ? 2.8 : 2}
                dot={{ r: theme === "light" ? 3.2 : 2.8, fill: chartAccent, stroke: theme === "light" ? "#fff7f1" : "#080808", strokeWidth: 1.2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel chart-panel--control">
          <h2>{locale === "en" ? "Control by phase" : "Control por fase"}</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={zoneData} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="zone" tick={{ fill: chartTextColor, fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chartAccent, fontSize: 9, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "rgba(255,107,43,0.04)" }} contentStyle={tooltipStyle} />
              <Bar
                dataKey="value"
                fill={chartAccent}
                stroke={theme === "light" ? "#9f3810" : "#ff8c4a"}
                strokeWidth={theme === "light" ? 1.2 : 0.8}
                background={{ fill: theme === "light" ? "rgba(217,79,22,0.1)" : "rgba(255,107,43,0.05)", stroke: theme === "light" ? "rgba(173,70,27,0.3)" : "rgba(255,107,43,0.12)", strokeWidth: 1 }}
              >
                {zoneData.map((zoneItem, index) => (
                  <Cell
                    key={zoneItem.zone}
                    fill={theme === "light" ? `rgba(217,79,22,${0.62 + index * 0.1})` : `rgba(255,107,43,${0.38 + index * 0.16})`}
                    stroke={chartAccent}
                    strokeWidth={theme === "light" ? 1.2 : 0.8}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article className="chart-panel chart-panel--field">
          <h2>{locale === "en" ? "Model map" : "Mapa del modelo"}</h2>
          <svg fill="none" aria-hidden="true" viewBox="0 0 240 130"><defs><radialGradient id="heat-hot" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(255,146,67,0.9)"/><stop offset="35%" stopColor="rgba(244,223,72,0.78)"/><stop offset="62%" stopColor="rgba(117,241,77,0.58)"/><stop offset="100%" stopColor="rgba(33,110,255,0)"/></radialGradient><filter id="heat-blur"><feGaussianBlur stdDeviation="7"/></filter></defs><path stroke="rgba(255,107,43,0.34)" strokeWidth=".75" d="M2 2h236v126H2z"/><path stroke={chartAxisColor} strokeWidth=".75" d="M120 2v126"/><circle cx="120" cy="65" r="20" stroke={chartAxisColor} strokeWidth=".75"/><path stroke={chartAxisColor} strokeWidth=".75" d="M2 44h38v42H2zm198 0h38v42h-38z"/><g fill="url(#heat-hot)" filter="url(#heat-blur)"><circle cx="55" cy="40" r="24"/><circle cx="80" cy="95" r="30"/><circle cx="105" cy="58" r="20"/><circle cx="140" cy="70" r="22"/><circle cx="165" cy="40" r="18"/><circle cx="186" cy="88" r="16"/></g><path fill="url(#heat-hot)" d="M2 2h236v126H2z" opacity=".08"/></svg>
        </article>
      </section>
    </>
  );
}

function DashboardRecentVideos({
  items,
  featuredId,
  totalAnalysisLabel,
  onSelect,
}: {
  items: RecentVideo[];
  featuredId: string | null;
  totalAnalysisLabel: number;
  onSelect: (videoId: string) => void;
}) {
  const { locale } = useAppPreferences();

  return (
    <section className="recent-videos lab-panel">
      <div className="panel-heading recent-videos__heading">
        <div>
          <div className="recent-videos__eyebrow">
            <span>{locale === "en" ? "Archive" : "Archivo"}</span>
            <span className="recent-videos__eyebrow-line" aria-hidden="true" />
            <span>{locale === "en" ? "Analyzed matches" : "Partidos analizados"}</span>
          </div>
          <h2>
            {locale === "en" ? <>Video <em>history</em></> : <>Historial <em>de videos</em></>}
          </h2>
        </div>
        <Link href="/dashboard/videos" className="text-command">
          <History size={13} />
          {totalAnalysisLabel} {locale === "en" ? "analyses" : "análisis"}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">
          <ScanLine size={24} />
          <strong>{locale === "en" ? "No videos have been registered yet." : "No hay videos registrados todavía."}</strong>
          <span>{locale === "en" ? "Upload your first match from the main console." : "Sube tu primer partido desde la consola central."}</span>
        </div>
      ) : (
        <div className="video-list recent-videos__grid">
          {items.slice(0, 4).map((video) => (
            <article
              className={`video-row video-row--shell ${video.id === featuredId ? "is-selected" : ""}`}
              key={video.id}
            >
              <button className="video-row__select" type="button" onClick={() => onSelect(video.id)}>
                <span className="video-row__icon">
                  <Film size={17} />
                </span>
                <div className="video-row__body">
                  <strong className="video-row__title" title={video.originalFilename}>
                    {video.originalFilename}
                  </strong>
                  <span className="video-row__description" title={formatVideoOpponent(video, locale)}>
                    {formatVideoOpponent(video, locale)}
                  </span>
                  <span className="video-row__meta-inline">
                    <span>{locale === "en" ? "Uploaded" : "Fecha de subida"}: {formatDate(video.createdAt, locale)}</span>
                  </span>
                  <span className="video-row__meta-inline">
                    <span>{locale === "en" ? "Duration" : "Duración"}: {getVideoDurationLabel(video)}</span>
                  </span>
                </div>
                <span className="video-row__status-group">
                  <span className="video-row__status-label">{locale === "en" ? "Status" : "Estado"}</span>
                  <span className={`status-pill ${getVideoStatusClass(video)}`}>{getVideoStatusLabel(video, locale)}</span>
                </span>
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
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
  const [state, dispatch] = useReducer(animatedMetricReducer, { animatedValue: 0, animatedBar: 0 });

  useEffect(() => {
    if (isLoading) {
      dispatch({ type: "set", value: 0, bar: 0 });
      return;
    }

    if (reducedMotion) {
      dispatch({ type: "set", value: safeValue, bar: safeBar });
      return;
    }

    const durationMs = 1100;
    const start = performance.now();
    let frame = 0;

    dispatch({ type: "set", value: 0, bar: 0 });

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      dispatch({ type: "set", value: safeValue * eased, bar: safeBar * eased });
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

function AnalyzedVideoPanel({
  video,
  onUploadAnother,
  onStreamError,
  onColorSaved,
  onColorToast,
  onReportToast,
  stepIndex,
}: {
  video: RecentVideo;
  onUploadAnother: () => void;
  onStreamError: (message: string) => void;
  onColorSaved: (video: RecentVideo) => void;
  onColorToast: (message: string) => void;
  onReportToast: (message: string, options?: ReportToastOptions) => void;
  stepIndex: number;
}) {
  const { locale } = useAppPreferences();
  const videoUrl = getProcessedVideoUrl(video) ?? `/api/videos/${video.id}/stream?variant=processed`;
  const analysisSteps = analysisStepsByLocale[locale];

  return (
    <div className="analysis-result-panel">
      <div className="analysis-result-panel__header">
        <div className="analysis-result-panel__header-copy">
          <span>{locale === "en" ? "Result ready" : "Resultado listo"}</span>
          <strong>{video.originalFilename}</strong>
        </div>
        <div className="analysis-result-panel__header-actions">
          <MatchColorEditor
            mode="header"
            video={video}
            onSaved={onColorSaved}
            onToast={onColorToast}
          />
          {video.latestMetrics ? (
            <ReportDownloadButton
              videoId={video.id}
              onToast={onReportToast}
              className="button ghost command-button analysis-result-panel__header-cta"
            />
          ) : null}
          <button className="button primary command-button analysis-result-panel__header-cta" type="button" onClick={onUploadAnother}>
            <Upload size={14} />
            {locale === "en" ? "Analyze another match" : "Analizar otro partido"}
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

function MissingProcessedOutputPanel({
  video,
  onReportToast,
  onUploadAnother,
}: {
  video: RecentVideo;
  onReportToast: (message: string, options?: ReportToastOptions) => void;
  onUploadAnother: () => void;
}) {
  const { locale } = useAppPreferences();
  const warning = getProcessedMissingWarning(video, locale);
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
        <div className="analysis-result-panel__header-actions">
          {video.latestMetrics ? <ReportDownloadButton videoId={video.id} onToast={onReportToast} /> : null}
          <button className="button ghost command-button" type="button" onClick={onUploadAnother}>
            <Upload size={14} />
            {locale === "en" ? "Analyze another match" : "Analizar otro partido"}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildBottomStats(
  ownPossession: number,
  rivalPossession: number,
  ownDistanceKm: number,
  rivalDistanceKm: number,
  locale: "es" | "en",
): BottomStatConfig[] {
  const possessionGap = Math.abs(ownPossession - rivalPossession);
  const distanceGap = Math.abs(ownDistanceKm - rivalDistanceKm);
  return [
    {
      id: "strip-own-possession",
      label: locale === "en" ? "Team 1 possession" : "Posesión Eq. 1",
      unit: "%",
      valueTarget: ownPossession,
      barTarget: ownPossession || 0,
      formatValue: formatPercentMetric,
    },
    {
      id: "strip-rival-possession",
      label: locale === "en" ? "Team 2 possession" : "Posesión Eq. 2",
      unit: "%",
      valueTarget: rivalPossession,
      barTarget: rivalPossession || 0,
      formatValue: formatPercentMetric,
    },
    {
      id: "strip-own-distance",
      label: locale === "en" ? "Own distance" : "Dist. propio",
      unit: "km",
      valueTarget: ownDistanceKm,
      barTarget: Math.min(100, ownDistanceKm * 10),
      formatValue: formatKm,
    },
    {
      id: "strip-rival-distance",
      label: locale === "en" ? "Opponent distance" : "Dist. rival",
      unit: "km",
      valueTarget: rivalDistanceKm,
      barTarget: Math.min(100, rivalDistanceKm * 10),
      formatValue: formatKm,
    },
    {
      id: "strip-possession-gap",
      label: locale === "en" ? "Possession gap" : "Dif. posesión",
      unit: "pp",
      valueTarget: possessionGap,
      barTarget: Math.min(100, possessionGap),
      formatValue: formatPercentMetric,
    },
    {
      id: "strip-distance-gap",
      label: locale === "en" ? "Distance gap" : "Dif. distancia",
      unit: "km",
      valueTarget: distanceGap,
      barTarget: Math.min(100, distanceGap * 10),
      formatValue: formatKm,
    },
  ];
}

function buildRadar(
  ownPossession: number,
  rivalPossession: number,
  ownDistanceKm: number,
  rivalDistanceKm: number,
  locale: "es" | "en",
) {
  if (!Number.isFinite(ownPossession) || !Number.isFinite(rivalPossession)) {
    return radarFallback.map((item) => ({
      ...item,
      subject: locale === "en" && item.subject === "Distancia" ? "Distance" : item.subject,
    }));
  }
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
      subject: locale === "en" ? "Distance" : "Distancia",
      local: ownDistanceShare,
      rival: rivalDistanceShare,
      localValue: `${formatKm(ownDistanceKm)} km`,
      rivalValue: `${formatKm(rivalDistanceKm)} km`,
    },
    {
      subject: locale === "en" ? "Dominance" : "Dominio",
      local: ownDominance,
      rival: rivalDominance,
      localValue: `${ownDominance.toFixed(0)}/100`,
      rivalValue: `${rivalDominance.toFixed(0)}/100`,
    },
    {
      subject: locale === "en" ? "Tempo" : "Ritmo",
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
  const { locale } = useAppPreferences();
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload ?? {};
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      <span>{locale === "en" ? "Own team" : "Equipo propio"}: {String(data.localValue ?? "-")}</span>
      <span>{locale === "en" ? "Opponent" : "Equipo rival"}: {String(data.rivalValue ?? "-")}</span>
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

function isVideoFailed(video: RecentVideo) {
  return video.status === "FAILED" || video.latestJob?.status === "FAILED";
}

function getVideoStatusLabel(video: RecentVideo, locale: "es" | "en" = "es") {
  if (video.latestJob?.cancelled) return locale === "en" ? "Analysis cancelled" : "Análisis cancelado";
  if (video.latestJob?.status === "QUEUED" && getVideoProgress(video) === 0) {
    return locale === "en" ? "Waiting for worker" : "Esperando worker";
  }
  const labels: Record<string, { es: string; en: string }> = {
    UPLOADING: { es: "subiendo", en: "uploading" },
    UPLOADED: { es: "subido", en: "uploaded" },
    PENDING_ANALYSIS: { es: "análisis pendiente", en: "analysis pending" },
    PROCESSING: { es: "procesando", en: "processing" },
    COMPLETED: { es: "completado", en: "completed" },
    FAILED: { es: "fallido", en: "failed" },
  };
  return labels[video.status]?.[locale] ?? formatStatus(video.status);
}

function getVideoStatusClass(video: RecentVideo) {
  return video.latestJob?.cancelled ? "failed" : video.status.toLowerCase();
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

function formatVideoOpponent(video: RecentVideo, locale: "es" | "en" = "es") {
  const matchInfo = getVideoMatchInfo(video);
  if (matchInfo.ownTeam || matchInfo.rivalTeam) {
    return `${matchInfo.ownTeam ?? (locale === "en" ? "Team 1" : "Equipo 1")} vs ${matchInfo.rivalTeam ?? (locale === "en" ? "Team 2" : "Equipo 2")}`;
  }
  return locale === "en" ? "Match data" : "Datos de partido";
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

function getProcessedMissingWarning(video: RecentVideo, locale: "es" | "en" = "es") {
  const metadata = getVideoMetadata(video);
  const warnings = getResilienceWarnings(video);
  const hasProcessedRemote = typeof metadata.processedObjectKey === "string" || typeof metadata.annotatedObjectKey === "string";
  const hasProcessedLocal = typeof metadata.processedLocalPath === "string" || typeof metadata.annotatedLocalPath === "string";
  if (warnings.includes("PROCESSED_VIDEO_MISSING")) return locale === "en" ? "Video file missing." : "Falta el archivo de video.";
  if (video.status !== "COMPLETED") return "";
  return hasProcessedRemote || hasProcessedLocal
    ? ""
    : locale === "en"
      ? "The processed video location could not be found."
      : "No se encontró la ubicación del video procesado.";
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
  locale: "es" | "en" = "es",
) {
  const warning = getProcessedMissingWarning(video);
  if (warning) {
    pushToast(locale === "en" ? "Analysis complete, but the video is not stored in the cloud." : "Análisis finalizado, pero el video no está guardado en la nube.", {
      tone: "warning",
      dedupeKey: `${video.id}:processed-missing`,
      durationMs: 9000,
    });
    return;
  }

  const labels = getStorageLabels(video);
  if (labels.includes("Processed: R2")) {
    pushToast(locale === "en" ? "Analysis complete. Video stored in the cloud." : "Análisis completado. Video guardado en la nube.", {
      tone: "success",
      dedupeKey: `${video.id}:processed-r2`,
      durationMs: 9000,
    });
  } else if (labels.includes("Processed: Local")) {
    pushToast(locale === "en" ? "Analysis complete. Video stored on this device." : "Análisis completado. Video guardado en el dispositivo.", {
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

function formatDate(value: string, locale: "es" | "en" = "es") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "en" ? "Date unavailable" : "Fecha no disponible";
  return videoDateFormatters[locale].format(date);
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



