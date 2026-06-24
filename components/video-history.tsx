"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Film, Loader2, MoreVertical, RotateCcw, Trash2 } from "lucide-react";
import { AnalysisProcessingPanel } from "@/components/analysis-processing-panel";
import { AnalysisVideoPlayer } from "@/components/analysis-video-player";
import { ToastViewport, useAppToasts } from "@/components/app-toast";
import { MatchColorEditor } from "@/components/match-color-editor";
import { usePrefersReducedMotion } from "@/components/use-prefers-reduced-motion";
import { VideoEventSubscription } from "@/components/video-event-subscription";
import { type AnalysisMetrics } from "@/lib/analysis-metrics";

export type HistoryVideo = {
  id: string;
  originalFilename: string;
  status: string;
  sizeBytes: string;
  createdAt: string;
  updatedAt?: string | null;
  metadata?: unknown;
  sourceVideoUrl?: string;
  processedVideoUrl?: string | null;
  latestMetrics: AnalysisMetrics | null;
  latestJob: {
    id: string;
    status: string;
    progress: number;
    error: string | null;
  } | null;
};

type VideoHistoryProps = {
  initialVideos: HistoryVideo[];
  initialNextCursor?: string | null;
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

type HistoryMetricConfig = {
  id: string;
  label: string;
  unit: string;
  valueTarget: number;
  barTarget: number;
  color?: string;
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

type HistoryUiState = {
  retrying: boolean;
  openMenu: { id: string; x: number; y: number } | null;
  deleteTargetId: string | null;
  deleting: boolean;
};

type HistoryUiAction =
  | { type: "patch"; changes: Partial<HistoryUiState> }
  | { type: "toggleMenu"; menu: NonNullable<HistoryUiState["openMenu"]> };

const INITIAL_HISTORY_UI_STATE: HistoryUiState = {
  retrying: false,
  openMenu: null,
  deleteTargetId: null,
  deleting: false,
};

function historyUiReducer(state: HistoryUiState, action: HistoryUiAction): HistoryUiState {
  if (action.type === "toggleMenu") {
    return {
      ...state,
      openMenu: state.openMenu?.id === action.menu.id ? null : action.menu,
    };
  }
  return { ...state, ...action.changes };
}

function animatedMetricReducer(_state: AnimatedMetricState, action: AnimatedMetricAction): AnimatedMetricState {
  return {
    animatedValue: action.value,
    animatedBar: action.bar,
  };
}

export function VideoHistory({ initialNextCursor = null, initialVideos }: VideoHistoryProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [selectedId, setSelectedId] = useState(initialVideos[0]?.id ?? "");
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uiState, dispatchUi] = useReducer(historyUiReducer, INITIAL_HISTORY_UI_STATE);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const { retrying, openMenu, deleteTargetId, deleting } = uiState;
  const { toasts, pushToast, dismissToast } = useAppToasts();
  const selected = useMemo(
    () => videos.find((video) => video.id === selectedId) ?? videos[0] ?? null,
    [selectedId, videos],
  );
  const deleteTarget = useMemo(
    () => videos.find((video) => video.id === deleteTargetId) ?? null,
    [deleteTargetId, videos],
  );

  const metrics = selected?.latestMetrics ?? null;
  const matchInfo = getVideoMatchInfo(selected);
  const colorAssignment = useMemo(() => resolveTeamColorAssignment(matchInfo, metrics), [matchInfo, metrics]);
  const ownTeamName = metrics?.match?.ownTeam ?? matchInfo.ownTeam ?? "Equipo 1";
  const rivalTeamName = metrics?.match?.rivalTeam ?? matchInfo.rivalTeam ?? "Equipo 2";
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
  const showColorEditor = Boolean(selected && selected.status === "COMPLETED" && getProcessedVideoUrl(selected));
  const hasCompletedMetrics = Boolean(selected && selected.status === "COMPLETED" && metrics);
  const metricAnimationSeed = [
    selected?.id ?? "no-video",
    selected?.status ?? "no-status",
    selected?.updatedAt ?? "no-updated-at",
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
  const historyMetrics: HistoryMetricConfig[] = [
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
      barTarget: Math.min(100, ownDistanceKm * 10),
      color: colorAssignment.ownTeamColor ?? undefined,
      formatValue: formatKm,
    },
    {
      id: "rival-distance",
      label: `Dist. ${rivalTeamName}`,
      unit: "km",
      valueTarget: rivalDistanceKm,
      barTarget: Math.min(100, rivalDistanceKm * 10),
      color: colorAssignment.rivalTeamColor ?? undefined,
      formatValue: formatKm,
    },
  ];

  const shouldPollSelected = selected ? isVideoProcessing(selected) : false;

  useEffect(() => {
    if (!openMenu) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest("[data-video-menu-surface]")) return;
      dispatchUi({ type: "patch", changes: { openMenu: null } });
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dispatchUi({ type: "patch", changes: { openMenu: null, deleteTargetId: null } });
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [openMenu]);

  async function refreshVideo(videoId: string) {
    const response = await fetch(`/api/videos/${videoId}`, { method: "GET", cache: "no-store" });
    const data = (await response.json().catch(() => ({}))) as { video?: HistoryVideo };
    if (!response.ok || !data.video) return;
    setVideos((current) => {
      const previous = current.find((video) => video.id === data.video!.id);
      if (previous?.status !== "COMPLETED" && data.video!.status === "COMPLETED") {
        pushToast("análisis terminado. El video ya está listo para revisarse.", {
          dedupeKey: `${data.video!.id}:completed`,
          durationMs: 8500,
          sound: true,
        });
        pushCompletionStorageToast(data.video!, pushToast);
      }
      return current.map((video) => (video.id === data.video!.id ? data.video! : video));
    });
  }

  async function retryAnalysis() {
    if (!selected) return;
    dispatchUi({ type: "patch", changes: { retrying: true } });
    const response = await fetch(`/api/videos/${selected.id}/analysis/retry`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { video?: HistoryVideo };
    dispatchUi({ type: "patch", changes: { retrying: false } });
    if (!response.ok || !data.video) return;
    setVideos((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
    setSelectedId(data.video.id);
    dispatchUi({ type: "patch", changes: { openMenu: null } });
    pushToast("Video recibido. Iniciando análisis.", {
      dedupeKey: `${data.video.id}:queued`,
      durationMs: 7000,
      sound: true,
    });
  }

  async function deleteVideo() {
    if (!deleteTarget) return;
    dispatchUi({ type: "patch", changes: { deleting: true } });
    const response = await fetch(`/api/videos/${deleteTarget.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { deletedId?: string; error?: string; code?: string };
    dispatchUi({ type: "patch", changes: { deleting: false } });
    if (!response.ok || !data.deletedId) {
      const message = data.error || "No se pudo eliminar el video.";
      pushToast(message, {
        tone: data.code === "VIDEO_ANALYSIS_ACTIVE" ? "warning" : "info",
        durationMs: 9000,
      });
      return;
    }

    setVideos((current) => {
      const nextVideos = current.filter((video) => video.id !== data.deletedId);
      if (selectedId === data.deletedId) {
        setSelectedId(nextVideos[0]?.id ?? "");
      }
      return nextVideos;
    });
    deleteDialogRef.current?.close();
    dispatchUi({ type: "patch", changes: { openMenu: null, deleteTargetId: null } });
  }

  async function loadMoreVideos() {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);
    const params = new URLSearchParams({
      cursor: nextCursor,
      limit: "25",
    });
    const response = await fetch(`/api/videos?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as {
      videos?: HistoryVideo[];
      nextCursor?: string | null;
    };
    setLoadingMore(false);

    if (!response?.ok || !Array.isArray(data.videos)) {
      pushToast("No se pudo cargar más historial.", { tone: "warning", durationMs: 7000 });
      return;
    }

    setVideos((current) => {
      const seen = new Set(current.map((video) => video.id));
      return [...current, ...data.videos!.filter((video) => !seen.has(video.id))];
    });
    setNextCursor(data.nextCursor ?? null);
  }

  function receiveVideoEvent(nextVideo: HistoryVideo) {
    setVideos((current) => {
      const previous = current.find((video) => video.id === nextVideo.id);
      if (previous?.status !== "COMPLETED" && nextVideo.status === "COMPLETED") {
        pushToast("análisis terminado. El video ya está listo para revisarse.", {
          dedupeKey: `${nextVideo.id}:completed`,
          durationMs: 8500,
          sound: true,
        });
        pushCompletionStorageToast(nextVideo, pushToast);
      }
      return current.map((video) => (video.id === nextVideo.id ? nextVideo : video));
    });
  }

  function closeDeleteDialog() {
    deleteDialogRef.current?.close();
    dispatchUi({ type: "patch", changes: { deleteTargetId: null } });
  }

  function openDeleteDialog(videoId: string) {
    dispatchUi({ type: "patch", changes: { deleteTargetId: videoId, openMenu: null } });
    window.setTimeout(() => deleteDialogRef.current?.showModal(), 0);
  }

  return (
    <>
      {selected && shouldPollSelected ? (
        <VideoEventSubscription
          key={selected.id}
          videoId={selected.id}
          onVideo={receiveVideoEvent}
          onError={() => void refreshVideo(selected.id)}
        />
      ) : null}
      <HistoryWorkspace
        videos={videos}
        selected={selected}
        retrying={retrying}
        openMenu={openMenu}
        showColorEditor={showColorEditor}
        hasCompletedMetrics={hasCompletedMetrics}
        historyMetrics={historyMetrics}
        metricAnimationSeed={metricAnimationSeed}
        onColorSaved={(nextVideo) =>
          setVideos((current) => current.map((video) => (video.id === nextVideo.id ? nextVideo : video)))
        }
        onColorToast={(message) => pushToast(message, { durationMs: 7000, sound: true })}
        onStreamError={(message) => pushToast(message, { tone: "warning", durationMs: 9000 })}
        onRetry={() => void retryAnalysis()}
        onSelect={setSelectedId}
        onToggleMenu={(videoId, rect) =>
          dispatchUi({
            type: "toggleMenu",
            menu: { id: videoId, x: Math.max(16, rect.right - 220), y: rect.bottom + 8 },
          })
        }
        hasMore={Boolean(nextCursor)}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMoreVideos()}
      />

      {openMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              className="history-action-menu"
              data-video-menu-surface
              role="menu"
              aria-label="Acciones del video"
              style={{ left: `${openMenu.x}px`, top: `${openMenu.y}px` }}
            >
              <button
                className="history-action-menu__item"
                type="button"
                role="menuitem"
                onClick={() => openDeleteDialog(openMenu.id)}
              >
                <Trash2 size={14} />
                Eliminar partido
              </button>
            </div>,
            document.body,
          )
        : null}

      <dialog
        ref={deleteDialogRef}
        className="history-modal-backdrop"
        aria-labelledby="history-delete-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDeleteDialog();
        }}
      >
        <button
          className="history-modal-backdrop__dismiss"
          type="button"
          aria-label="Cerrar confirmación de eliminación"
          onClick={closeDeleteDialog}
        />
        {deleteTarget ? (
          <div className="history-modal" aria-busy={deleting}>
            <div className="history-modal__eyebrow">Confirmación</div>
            <h2 id="history-delete-title">Eliminar partido del historial</h2>
            <p>
              Se eliminará <strong>{deleteTarget.originalFilename}</strong>, su video original, el video anotado
              y las métricas generadas por el modelo.
            </p>
            <div className="history-modal__actions">
              <button
                className="button ghost"
                type="button"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => void deleteVideo()} disabled={deleting}>
                {deleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

type HistoryWorkspaceProps = {
  videos: HistoryVideo[];
  selected: HistoryVideo | null;
  retrying: boolean;
  openMenu: HistoryUiState["openMenu"];
  showColorEditor: boolean;
  hasCompletedMetrics: boolean;
  historyMetrics: HistoryMetricConfig[];
  metricAnimationSeed: string;
  onColorSaved: (video: HistoryVideo) => void;
  onColorToast: (message: string) => void;
  onStreamError: (message: string) => void;
  onRetry: () => void;
  onSelect: (videoId: string) => void;
  onToggleMenu: (videoId: string, rect: DOMRect) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

function HistoryWorkspace({
  videos,
  selected,
  retrying,
  openMenu,
  showColorEditor,
  hasCompletedMetrics,
  historyMetrics,
  metricAnimationSeed,
  onColorSaved,
  onColorToast,
  onStreamError,
  onRetry,
  onSelect,
  onToggleMenu,
  hasMore,
  loadingMore,
  onLoadMore,
}: HistoryWorkspaceProps) {
  return (
    <section className="history-workspace">
      <article className="history-main">
        <div className="history-detail lab-panel">
          <div className="panel-heading history-detail__heading">
            <div>
              <span>Detalle del partido</span>
              <h2>{selected?.originalFilename ?? "Sin selección"}</h2>
              {selected ? <StorageStatusInline video={selected} /> : null}
            </div>
            {selected ? (
              <div className="history-detail__heading-actions">
                {showColorEditor ? (
                  <MatchColorEditor
                    mode="header"
                    video={selected}
                    onToast={onColorToast}
                    onSaved={onColorSaved}
                  />
                ) : null}
                <span className={`status-pill ${selected.status.toLowerCase()}`}>{formatStatus(selected.status)}</span>
              </div>
            ) : null}
          </div>

          {selected ? (
            <div className="history-main__content">
              <div className="history-player-stack">
                <div className="history-player-sticky">
                  <div className="history-player-surface">
                    {selected.status === "COMPLETED" && getProcessedVideoUrl(selected) ? (
                      <AnalysisVideoPlayer
                        src={getProcessedVideoUrl(selected) ?? `/api/videos/${selected.id}/stream?variant=processed`}
                        title={selected.originalFilename}
                        onStreamError={onStreamError}
                      />
                    ) : isVideoProcessing(selected) ? (
                      <AnalysisProcessingPanel
                        filename={selected.originalFilename}
                        progress={getVideoProgress(selected)}
                        note="Subir otro video está bloqueado hasta terminar el tracking y la generación del video anotado."
                      />
                    ) : isVideoFailed(selected) ? (
                      <AnalysisProcessingPanel
                        variant="failed"
                        filename={selected.originalFilename}
                        note={selected.latestJob?.error || "El análisis se interrumpió antes de generar el video anotado."}
                        actionLabel={retrying ? "Reintentando..." : "Reintentar análisis"}
                        onAction={retrying ? undefined : onRetry}
                      />
                    ) : (
                      <div className="analysis-placeholder">
                        <BarChart3 size={24} />
                        <strong>{selected.latestJob ? `análisis ${formatStatus(selected.latestJob.status)}` : "análisis en espera"}</strong>
                        <span>{getVideoPlaceholderMessage(selected)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="history-insights">
                <div className="history-insights__header">
                  <span>Métricas del análisis</span>
                  <button className="button ghost command-button" type="button" onClick={onRetry} disabled={retrying} aria-busy={retrying}>
                    {retrying ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />}
                    {retrying ? "Reintentando..." : "Reanalizar"}
                  </button>
                </div>

                <div className="history-stat-grid">
                  {historyMetrics.map((metric) => (
                    <AnimatedMetricTile
                      key={metric.id}
                      animationKey={`${metricAnimationSeed}|history|${metric.id}|${metric.valueTarget.toFixed(3)}|${metric.barTarget.toFixed(3)}|${metric.color ?? "default"}`}
                      isLoading={!hasCompletedMetrics}
                      metric={metric}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <BarChart3 size={24} />
              <strong>Sin partido seleccionado.</strong>
              <span>El historial mostrará las métricas específicas de cada video.</span>
            </div>
          )}
        </div>
      </article>

      <aside className="history-list lab-panel">
        <div className="panel-heading history-list__heading">
          <div>
            <span>Historial</span>
            <h2>Partidos subidos</h2>
          </div>
          <span className="history-list__count">{videos.length}</span>
        </div>

        {videos.length === 0 ? (
          <div className="empty-state">
            <Film size={24} />
            <strong>No hay partidos todavía.</strong>
            <span>Sube un video desde el panel principal para activar el análisis.</span>
          </div>
        ) : (
          <div className="video-list history-list__scroll">
            {videos.map((video) => (
              <article
                className={`video-row video-row--shell ${video.id === selected?.id ? "is-selected" : ""}`}
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
                    <span className="video-row__description" title={formatVideoOpponent(video)}>
                      {formatVideoOpponent(video)}
                    </span>
                    <span className="video-row__meta-inline">
                      <span>{formatDate(video.createdAt)}</span>
                      <span>{formatBytes(Number(video.sizeBytes))}</span>
                    </span>
                    <StorageStatusInline video={video} />
                  </div>
                  <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
                </button>

                <div className="video-row__actions">
                  <button
                    className="icon-button icon-button--compact"
                    type="button"
                    aria-label={`Abrir acciones para ${video.originalFilename}`}
                    aria-expanded={openMenu?.id === video.id}
                    onClick={(event) => onToggleMenu(video.id, event.currentTarget.getBoundingClientRect())}
                  >
                    <MoreVertical size={15} />
                  </button>
                </div>
              </article>
            ))}
            {hasMore ? (
              <button className="button ghost history-list__load-more" type="button" onClick={onLoadMore} disabled={loadingMore} aria-busy={loadingMore}>
                {loadingMore ? <Loader2 className="spin" size={14} /> : null}
                {loadingMore ? "Cargando más..." : "Cargar más"}
              </button>
            ) : null}
          </div>
        )}
      </aside>
    </section>
  );
}

function AnimatedMetricTile({
  metric,
  animationKey,
  isLoading,
}: {
  metric: HistoryMetricConfig;
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
    <article className="stat-cell history-stat" title={`${metric.label}: ${displayValue}${metric.unit}`} aria-label={`${metric.label}: ${displayValue}${metric.unit}`}>
      <span>{metric.label}</span>
      <strong>
        {displayValue}
        <small>{metric.unit}</small>
      </strong>
      <AnimatedMetricBar color={metric.color} isLoading={isLoading} percent={animatedBar} reducedMotion={reducedMotion} />
    </article>
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
        style={{
          width: `${displayPercent}%`,
          background: color ?? undefined,
          transition: reducedMotion ? undefined : "none",
        }}
      />
    </span>
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

function getOwnDistanceKm(metrics: AnalysisMetrics | null) {
  return metrics?.distance.teams?.own.totalKm ?? (metrics?.teamDistances?.ownTeam ?? 0) / 1000;
}

function getRivalDistanceKm(metrics: AnalysisMetrics | null) {
  return metrics?.distance.teams?.rival.totalKm ?? (metrics?.teamDistances?.rivalTeam ?? 0) / 1000;
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function isVideoProcessing(video: HistoryVideo) {
  return (
    video.status === "PENDING_ANALYSIS" ||
    video.status === "PROCESSING" ||
    video.latestJob?.status === "QUEUED" ||
    video.latestJob?.status === "RUNNING"
  );
}

function isVideoFailed(video: HistoryVideo) {
  return video.status === "FAILED" || video.latestJob?.status === "FAILED";
}

function getProcessedVideoUrl(video: HistoryVideo) {
  return video.processedVideoUrl || null;
}

function getVideoMatchInfo(video: HistoryVideo | null): MatchInfo {
  if (!video) return {};
  const metadata = video.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const matchInfo = (metadata as { matchInfo?: unknown }).matchInfo;
  if (!matchInfo || typeof matchInfo !== "object" || Array.isArray(matchInfo)) return {};
  return matchInfo as MatchInfo;
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

function formatVideoOpponent(video: HistoryVideo) {
  const matchInfo = getVideoMatchInfo(video);
  if (matchInfo.ownTeam || matchInfo.rivalTeam) {
    return `${matchInfo.ownTeam ?? "Equipo 1"} vs ${matchInfo.rivalTeam ?? "Equipo 2"}`;
  }
  return "Sin equipos registrados";
}

function StorageStatusInline({ video }: { video: HistoryVideo }) {
  const labels = getStorageLabels(video);
  if (labels.length === 0) return null;

  const hasMissingOutput = labels.includes("Processed: Missing");
  const hasLocalOnlyOutput = labels.includes("Processed: Local");
  const tone = hasMissingOutput ? "warning" : hasLocalOnlyOutput ? "local" : "remote";
  const readableLabels = labels.map(formatStorageLabel);

  return (
    <span className={`storage-hint storage-hint--${tone}`} title={readableLabels.join(" / ")}>
      {readableLabels.join(" / ")}
    </span>
  );
}

function getVideoMetadata(video: HistoryVideo) {
  if (!video.metadata || typeof video.metadata !== "object" || Array.isArray(video.metadata)) {
    return {} as Record<string, unknown>;
  }
  return video.metadata as Record<string, unknown>;
}

function getStorageLabels(video: HistoryVideo) {
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

function formatStorageLabel(label: string) {
  switch (label) {
    case "Original: R2":
      return "Original R2";
    case "Original: Local":
      return "Original local";
    case "Processed: R2":
      return "Procesado R2";
    case "Processed: Local":
      return "Procesado local";
    case "Processed: Missing":
      return "Procesado faltante";
    default:
      return label;
  }
}

function getProcessedMissingWarning(video: HistoryVideo) {
  const metadata = getVideoMetadata(video);
  const warnings = getResilienceWarnings(video);
  const hasProcessedRemote = typeof metadata.processedObjectKey === "string" || typeof metadata.annotatedObjectKey === "string";
  const hasProcessedLocal = typeof metadata.processedLocalPath === "string" || typeof metadata.annotatedLocalPath === "string";
  if (warnings.includes("PROCESSED_VIDEO_MISSING")) return "Video file missing.";
  if (video.status !== "COMPLETED") return "";
  return hasProcessedRemote || hasProcessedLocal ? "" : "Processed video location not found.";
}

function getVideoPlaceholderMessage(video: HistoryVideo) {
  const missingWarning = getProcessedMissingWarning(video);
  const warnings = getResilienceWarnings(video);
  if (missingWarning) return missingWarning;
  if (warnings.includes("ANALYSIS_INTERRUPTED")) return "Analysis was interrupted.";
  if (video.status === "FAILED" && !video.latestJob?.error) return "Analysis was interrupted.";
  if (video.latestJob?.error) return video.latestJob.error;
  if (video.latestJob) return `Analizando video... (${getVideoProgress(video)}%)`;
  return "El worker generará el video anotado y las métricas.";
}

function getResilienceWarnings(video: HistoryVideo) {
  const metadata = getVideoMetadata(video);
  const raw = metadata.resilienceWarnings;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

function pushCompletionStorageToast(
  video: HistoryVideo,
  pushToast: (message: string, options?: { tone?: "success" | "info" | "warning"; durationMs?: number; dedupeKey?: string; sound?: boolean }) => void,
) {
  const warning = getProcessedMissingWarning(video);
  if (warning) {
    pushToast("Analysis completed but processed video not found in R2/local storage.", {
      tone: "warning",
      dedupeKey: `${video.id}:processed-missing`,
      durationMs: 9000,
    });
    return;
  }

  const labels = getStorageLabels(video);
  if (labels.includes("Processed: R2")) {
    pushToast("Analysis completed and processed video stored in Cloudflare R2.", {
      tone: "success",
      dedupeKey: `${video.id}:processed-r2`,
      durationMs: 9000,
    });
  } else if (labels.includes("Processed: Local")) {
    pushToast("Analysis completed. Processed video is only in local storage.", {
      tone: "warning",
      dedupeKey: `${video.id}:processed-local`,
      durationMs: 9000,
    });
  }
}

function getVideoProgress(video: HistoryVideo) {
  if (video.status === "COMPLETED" || video.status === "FAILED") return 100;
  return Math.max(0, Math.min(99, Math.round(video.latestJob?.progress ?? (video.status === "PENDING_ANALYSIS" ? 5 : 0))));
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return date.toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "Tamaño no disponible";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatKm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatPercentMetric(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toFixed(1);
}




