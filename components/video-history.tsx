"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, ChevronLeft, ChevronRight, Film, Loader2, MoreVertical, RotateCcw, Search, SlidersHorizontal, Trash2, XCircle } from "lucide-react";
import { AnalysisProcessingPanel } from "@/components/analysis-processing-panel";
import { AnalysisVideoPlayer } from "@/components/analysis-video-player";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { ToastViewport, useAppToasts } from "@/components/app-toast";
import { MatchColorEditor } from "@/components/match-color-editor";
import { ReportDownloadButton, type ReportToastOptions } from "@/components/report-download-button";
import { usePrefersReducedMotion } from "@/components/use-prefers-reduced-motion";
import { VideoEventSubscription } from "@/components/video-event-subscription";
import { type AnalysisMetrics } from "@/lib/analysis-metrics";
import { type AppLocale, type UiCopyKey } from "@/lib/preferences";

const HISTORY_DATE_FORMATTERS = {
  es: new Intl.DateTimeFormat("es-CR", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }),
};

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
    cancelled?: boolean;
  } | null;
};

type VideoHistoryProps = {
  initialVideos: HistoryVideo[];
  initialPagination: VideoPagination;
};

type VideoPagination = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type VideoFilterState = {
  q: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  minSizeMb: string;
  maxSizeMb: string;
  sort: "newest" | "oldest" | "name-asc" | "name-desc";
  pageSize: number;
};

const DEFAULT_VIDEO_FILTERS: VideoFilterState = {
  q: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  minSizeMb: "",
  maxSizeMb: "",
  sort: "newest",
  pageSize: 10,
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
  cancellingId: string | null;
  openMenu: { id: string; x: number; y: number } | null;
  deleteTargetId: string | null;
  deleting: boolean;
};

type HistoryUiAction =
  | { type: "patch"; changes: Partial<HistoryUiState> }
  | { type: "toggleMenu"; menu: NonNullable<HistoryUiState["openMenu"]> };

const INITIAL_HISTORY_UI_STATE: HistoryUiState = {
  retrying: false,
  cancellingId: null,
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

export function VideoHistory({ initialPagination, initialVideos }: VideoHistoryProps) {
  const { locale, t } = useAppPreferences();
  const english = locale === "en";
  const [videos, setVideos] = useState(initialVideos);
  const [selectedId, setSelectedId] = useState(initialVideos[0]?.id ?? "");
  const [pagination, setPagination] = useState(initialPagination);
  const [filters, setFilters] = useState<VideoFilterState>({ ...DEFAULT_VIDEO_FILTERS, pageSize: initialPagination.pageSize });
  const [activeFilters, setActiveFilters] = useState<VideoFilterState>({ ...DEFAULT_VIDEO_FILTERS, pageSize: initialPagination.pageSize });
  const [filtering, setFiltering] = useState(false);
  const [uiState, dispatchUi] = useReducer(historyUiReducer, INITIAL_HISTORY_UI_STATE);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const { retrying, cancellingId, openMenu, deleteTargetId, deleting } = uiState;
  const { toasts, pushToast, dismissToast } = useAppToasts();
  const selected = useMemo(
    () => videos.find((video) => video.id === selectedId) ?? videos[0] ?? null,
    [selectedId, videos],
  );
  const deleteTarget = useMemo(
    () => videos.find((video) => video.id === deleteTargetId) ?? null,
    [deleteTargetId, videos],
  );
  const menuVideo = useMemo(
    () => (openMenu ? videos.find((video) => video.id === openMenu.id) ?? null : null),
    [openMenu, videos],
  );

  const metrics = selected?.latestMetrics ?? null;
  const matchInfo = getVideoMatchInfo(selected);
  const colorAssignment = useMemo(() => resolveTeamColorAssignment(matchInfo, metrics), [matchInfo, metrics]);
  const ownTeamName = metrics?.match?.ownTeam ?? matchInfo.ownTeam ?? (english ? "Team 1" : "Equipo 1");
  const rivalTeamName = metrics?.match?.rivalTeam ?? matchInfo.rivalTeam ?? (english ? "Team 2" : "Equipo 2");
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
    if (!response.ok) return;
    const data = (await response.json().catch(() => ({}))) as { video?: HistoryVideo };
    if (!data.video) return;
    setVideos((current) => {
      const previous = current.find((video) => video.id === data.video!.id);
      if (previous?.status !== "COMPLETED" && data.video!.status === "COMPLETED") {
        pushToast(english ? "Analysis complete. The video is ready to review." : "Análisis terminado. El video ya está listo para revisarse.", {
          dedupeKey: `${data.video!.id}:completed`,
          durationMs: 8500,
          sound: true,
        });
        pushCompletionStorageToast(data.video!, pushToast, locale);
      }
      return current.map((video) => (video.id === data.video!.id ? data.video! : video));
    });
  }

  async function retryAnalysis() {
    if (!selected) return;
    dispatchUi({ type: "patch", changes: { retrying: true } });
    const response = await fetch(`/api/videos/${selected.id}/analysis/retry`, { method: "POST" });
    dispatchUi({ type: "patch", changes: { retrying: false } });
    if (!response.ok) return;
    const data = (await response.json().catch(() => ({}))) as { video?: HistoryVideo };
    if (!data.video) return;
    setVideos((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
    setSelectedId(data.video.id);
    dispatchUi({ type: "patch", changes: { openMenu: null } });
    pushToast(english ? "Video received. Starting analysis." : "Video recibido. Iniciando análisis.", {
      dedupeKey: `${data.video.id}:queued`,
      durationMs: 7000,
      sound: true,
    });
  }

  async function cancelAnalysis(videoId: string) {
    if (cancellingId) return;
    dispatchUi({ type: "patch", changes: { cancellingId: videoId } });
    const response = await fetch(`/api/videos/${videoId}/analysis/cancel`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { video?: HistoryVideo; error?: string } | undefined;
    dispatchUi({ type: "patch", changes: { cancellingId: null } });

    if (!response?.ok || !data?.video) {
      pushToast(data?.error || (english ? "The analysis could not be cancelled." : "No se pudo cancelar el análisis."), { tone: "warning", durationMs: 8000 });
      return;
    }

    setVideos((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
    setSelectedId(data.video.id);
    dispatchUi({ type: "patch", changes: { openMenu: null } });
    pushToast(english ? "Analysis cancelled. The original video was preserved and can be retried later." : "Análisis cancelado. El video original se conserva y puedes reintentarlo después.", {
      dedupeKey: `${data.video.id}:cancelled`,
      durationMs: 8000,
      sound: true,
    });
  }

  async function deleteVideo() {
    if (!deleteTarget) return;
    dispatchUi({ type: "patch", changes: { deleting: true } });
    const response = await fetch(`/api/videos/${deleteTarget.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      dispatchUi({ type: "patch", changes: { deleting: false } });
      pushToast(data.error || (english ? "The video could not be deleted." : "No se pudo eliminar el video."), {
        tone: data.code === "VIDEO_ANALYSIS_ACTIVE" ? "warning" : "info",
        durationMs: 9000,
      });
      return;
    }
    const data = (await response.json().catch(() => ({}))) as { deletedId?: string };
    dispatchUi({ type: "patch", changes: { deleting: false } });
    if (!data.deletedId) return;

    const nextVideos = videos.filter((video) => video.id !== data.deletedId);
    setVideos(nextVideos);
    if (selectedId === data.deletedId) setSelectedId(nextVideos[0]?.id ?? "");
    deleteDialogRef.current?.close();
    dispatchUi({ type: "patch", changes: { openMenu: null, deleteTargetId: null } });
    void loadPage(pagination.page);
  }

  async function loadPage(page: number, nextFilters = activeFilters) {
    if (filtering) return;

    setFiltering(true);
    const params = new URLSearchParams({ page: String(page), limit: String(nextFilters.pageSize) });
    for (const [key, value] of Object.entries(nextFilters)) {
      if (key === "pageSize" || value === "" || value === undefined) continue;
      params.set(key, String(value));
    }
    const response = await fetch(`/api/videos?${params.toString()}`, { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setFiltering(false);
      pushToast(english ? "The history could not be refreshed." : "No se pudo actualizar el historial.", { tone: "warning", durationMs: 7000 });
      return;
    }
    const data = (await response.json().catch(() => ({}))) as {
      videos?: HistoryVideo[];
      pagination?: VideoPagination;
    };
    setFiltering(false);

    if (!Array.isArray(data.videos) || !data.pagination) {
      pushToast(english ? "The history could not be refreshed." : "No se pudo actualizar el historial.", { tone: "warning", durationMs: 7000 });
      return;
    }

    setVideos(data.videos);
    setPagination(data.pagination);
    setSelectedId(data.videos[0]?.id ?? "");
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveFilters(filters);
    void loadPage(1, filters);
  }

  function clearFilters() {
    const cleared = { ...DEFAULT_VIDEO_FILTERS };
    setFilters(cleared);
    setActiveFilters(cleared);
    void loadPage(1, cleared);
  }

  function receiveVideoEvent(nextVideo: HistoryVideo) {
    setVideos((current) => {
      const previous = current.find((video) => video.id === nextVideo.id);
      if (previous?.status !== "COMPLETED" && nextVideo.status === "COMPLETED") {
        pushToast(english ? "Analysis complete. The video is ready to review." : "Análisis terminado. El video ya está listo para revisarse.", {
          dedupeKey: `${nextVideo.id}:completed`,
          durationMs: 8500,
          sound: true,
        });
        pushCompletionStorageToast(nextVideo, pushToast, locale);
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
        cancelling={cancellingId === selected?.id}
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
        onReportToast={(message, options) => pushToast(message, options)}
        onRetry={() => void retryAnalysis()}
        onCancel={() => selected && void cancelAnalysis(selected.id)}
        onSelect={setSelectedId}
        onToggleMenu={(videoId, rect) =>
          dispatchUi({
            type: "toggleMenu",
            menu: { id: videoId, x: Math.max(16, rect.right - 220), y: rect.bottom + 8 },
          })
        }
        filters={filters}
        filtering={filtering}
        pagination={pagination}
        hasActiveFilters={hasActiveVideoFilters(activeFilters)}
        onFiltersChange={setFilters}
        onApplyFilters={applyFilters}
        onClearFilters={clearFilters}
        onPageChange={(page) => void loadPage(page)}
        t={t}
        locale={locale}
      />

      {openMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              className="history-action-menu"
              data-video-menu-surface
              role="menu"
              aria-label={english ? "Video actions" : "Acciones del video"}
              style={{ left: `${openMenu.x}px`, top: `${openMenu.y}px` }}
            >
              {menuVideo && isVideoProcessing(menuVideo) ? (
                <button
                  className="history-action-menu__item"
                  type="button"
                  role="menuitem"
                  onClick={() => void cancelAnalysis(menuVideo.id)}
                  disabled={cancellingId === menuVideo.id}
                >
                  {cancellingId === menuVideo.id ? <Loader2 className="spin" size={14} /> : <XCircle size={14} />}
                  {cancellingId === menuVideo.id ? (english ? "Cancelling..." : "Cancelando...") : (english ? "Cancel analysis" : "Cancelar análisis")}
                </button>
              ) : null}
              <button
                className="history-action-menu__item"
                type="button"
                role="menuitem"
                onClick={() => openDeleteDialog(openMenu.id)}
              >
                <Trash2 size={14} />
                {english ? "Delete match" : "Eliminar partido"}
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
          aria-label={english ? "Close delete confirmation" : "Cerrar confirmación de eliminación"}
          onClick={closeDeleteDialog}
        />
        {deleteTarget ? (
          <div className="history-modal" aria-busy={deleting}>
            <div className="history-modal__eyebrow">{english ? "Confirmation" : "Confirmación"}</div>
            <h2 id="history-delete-title">{english ? "Delete match from history" : "Eliminar partido del historial"}</h2>
            <p>
              {english ? "This will delete " : "Se eliminará "}<strong>{deleteTarget.originalFilename}</strong>{english
                ? ", its original video, annotated video, and model-generated metrics."
                : ", su video original, el video anotado y las métricas generadas por el modelo."}
            </p>
            <div className="history-modal__actions">
              <button
                className="button ghost"
                type="button"
                onClick={closeDeleteDialog}
                disabled={deleting}
              >
                {english ? "Cancel" : "Cancelar"}
              </button>
              <button className="button danger" type="button" onClick={() => void deleteVideo()} disabled={deleting}>
                {deleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                {deleting ? (english ? "Deleting..." : "Eliminando...") : (english ? "Delete" : "Eliminar")}
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
  cancelling: boolean;
  openMenu: HistoryUiState["openMenu"];
  showColorEditor: boolean;
  hasCompletedMetrics: boolean;
  historyMetrics: HistoryMetricConfig[];
  metricAnimationSeed: string;
  onColorSaved: (video: HistoryVideo) => void;
  onColorToast: (message: string) => void;
  onStreamError: (message: string) => void;
  onReportToast: (message: string, options?: ReportToastOptions) => void;
  onRetry: () => void;
  onCancel: () => void;
  onSelect: (videoId: string) => void;
  onToggleMenu: (videoId: string, rect: DOMRect) => void;
  filters: VideoFilterState;
  filtering: boolean;
  pagination: VideoPagination;
  hasActiveFilters: boolean;
  onFiltersChange: (filters: VideoFilterState) => void;
  onApplyFilters: (event: React.FormEvent<HTMLFormElement>) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  t: (key: UiCopyKey) => string;
  locale: AppLocale;
};

function HistoryWorkspace({
  videos,
  selected,
  retrying,
  cancelling,
  openMenu,
  showColorEditor,
  hasCompletedMetrics,
  historyMetrics,
  metricAnimationSeed,
  onColorSaved,
  onColorToast,
  onStreamError,
  onReportToast,
  onRetry,
  onCancel,
  onSelect,
  onToggleMenu,
  filters,
  filtering,
  pagination,
  hasActiveFilters,
  onFiltersChange,
  onApplyFilters,
  onClearFilters,
  onPageChange,
  t,
  locale,
}: HistoryWorkspaceProps) {
  const english = locale === "en";
  return (
    <section className="history-workspace">
      <article className="history-main">
        <div className="history-detail lab-panel">
          <div className="panel-heading history-detail__heading">
            <div>
              <span>{english ? "Match details" : "Detalle del partido"}</span>
              <h2>{selected?.originalFilename ?? (english ? "No selection" : "Sin selección")}</h2>
              {selected ? <StorageStatusInline video={selected} locale={locale} /> : null}
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
                <span className={`status-pill ${getVideoStatusClass(selected)}`}>{getVideoStatusLabel(selected, locale)}</span>
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
                        note={english ? "You can cancel the analysis without deleting the original video." : "Puedes cancelar el análisis sin eliminar el video original."}
                        actionLabel={cancelling ? (english ? "Cancelling..." : "Cancelando...") : (english ? "Cancel analysis" : "Cancelar análisis")}
                        onAction={cancelling ? undefined : onCancel}
                        actionDisabled={cancelling}
                      />
                    ) : isVideoFailed(selected) ? (
                      <AnalysisProcessingPanel
                        variant="failed"
                        title={selected.latestJob?.cancelled ? (english ? "Analysis cancelled" : "Análisis cancelado") : undefined}
                        filename={selected.originalFilename}
                        note={
                          selected.latestJob?.cancelled
                            ? (english ? "The original video was preserved. Retry when the worker is available." : "El video original se conserva. Puedes reintentar el análisis cuando el worker esté disponible.")
                            : selected.latestJob?.error || (english ? "The analysis stopped before generating the annotated video." : "El análisis se interrumpió antes de generar el video anotado.")
                        }
                        actionLabel={retrying ? (english ? "Retrying..." : "Reintentando...") : (english ? "Retry analysis" : "Reintentar análisis")}
                        onAction={retrying ? undefined : onRetry}
                      />
                    ) : (
                      <div className="analysis-placeholder">
                        <BarChart3 size={24} />
                        <strong>{selected.latestJob ? `${english ? "analysis" : "análisis"} ${formatStatus(selected.latestJob.status, locale)}` : (english ? "analysis waiting" : "análisis en espera")}</strong>
                        <span>{getVideoPlaceholderMessage(selected, locale)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="history-insights">
                <div className="history-insights__header">
                  <span>{english ? "Analysis metrics" : "Métricas del análisis"}</span>
                  <div className="history-detail__heading-actions">
                    {hasCompletedMetrics ? (
                      <ReportDownloadButton videoId={selected.id} onToast={onReportToast} />
                    ) : null}
                    <button
                      className="button ghost command-button"
                      type="button"
                      onClick={onRetry}
                      disabled={retrying || isVideoProcessing(selected)}
                      aria-busy={retrying}
                    >
                      {retrying ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />}
                      {retrying ? (english ? "Retrying..." : "Reintentando...") : (english ? "Analyze again" : "Reanalizar")}
                    </button>
                  </div>
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
              <strong>{english ? "No match selected." : "Sin partido seleccionado."}</strong>
              <span>{english ? "History will show the metrics for each video." : "El historial mostrará las métricas específicas de cada video."}</span>
            </div>
          )}
        </div>
      </article>

      <aside className="history-list lab-panel">
        <div className="panel-heading history-list__heading">
          <div>
            <span>{english ? "History" : "Historial"}</span>
            <h2>{english ? "Uploaded matches" : "Partidos subidos"}</h2>
          </div>
          <span className="history-list__count">{pagination.totalItems}</span>
        </div>

        <VideoHistoryFilters
          filters={filters}
          filtering={filtering}
          onChange={onFiltersChange}
          onSubmit={onApplyFilters}
          onClear={onClearFilters}
          t={t}
        />

        {videos.length === 0 ? (
          <div className="empty-state">
            <Film size={24} />
            <strong>{hasActiveFilters ? t("noFilterResults") : (english ? "No matches yet." : "No hay partidos todavía.")}</strong>
            <span>{hasActiveFilters ? (english ? "Adjust or clear the filters to broaden your search." : "Ajusta o limpia los filtros para ampliar la búsqueda.") : (english ? "Upload a video from the dashboard to start an analysis." : "Sube un video desde el panel principal para activar el análisis.")}</span>
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
                    <span className="video-row__description" title={formatVideoOpponent(video, locale)}>
                      {formatVideoOpponent(video, locale)}
                    </span>
                    <span className="video-row__meta-inline">
                      <span>{formatDate(video.createdAt, locale)}</span>
                      <span>{formatBytes(Number(video.sizeBytes))}</span>
                    </span>
                    <StorageStatusInline video={video} locale={locale} />
                  </div>
                  <span className={`status-pill ${getVideoStatusClass(video)}`}>{getVideoStatusLabel(video, locale)}</span>
                </button>

                <div className="video-row__actions">
                  <button
                    className="icon-button icon-button--compact"
                    type="button"
                    aria-label={`${english ? "Open actions for" : "Abrir acciones para"} ${video.originalFilename}`}
                    aria-expanded={openMenu?.id === video.id}
                    onClick={(event) => onToggleMenu(video.id, event.currentTarget.getBoundingClientRect())}
                  >
                    <MoreVertical size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        {pagination.totalItems > 0 ? (
          <nav className="history-pagination" aria-label={english ? "History pagination" : "Paginación del historial"}>
            <button type="button" onClick={() => onPageChange(pagination.page - 1)} disabled={filtering || pagination.page <= 1} aria-label={t("previousPage")}>
              <ChevronLeft size={16} />
            </button>
            <span>{t("page")} <strong>{pagination.page}</strong> {t("of")} {pagination.totalPages}</span>
            <button type="button" onClick={() => onPageChange(pagination.page + 1)} disabled={filtering || pagination.page >= pagination.totalPages} aria-label={t("nextPage")}>
              <ChevronRight size={16} />
            </button>
          </nav>
        ) : null}
      </aside>
    </section>
  );
}

function VideoHistoryFilters({
  filters,
  filtering,
  onChange,
  onSubmit,
  onClear,
  t,
}: {
  filters: VideoFilterState;
  filtering: boolean;
  onChange: (filters: VideoFilterState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  t: (key: UiCopyKey) => string;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedVideoFilters(filters));
  const update = <Key extends keyof VideoFilterState>(key: Key, value: VideoFilterState[Key]) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <form className="history-filters" onSubmit={onSubmit} aria-busy={filtering}>
      <div className="history-filters__search">
        <Search size={15} aria-hidden="true" />
        <label className="visually-hidden" htmlFor="video-history-search">{t("searchVideos")}</label>
        <input
          id="video-history-search"
          type="search"
          value={filters.q}
          placeholder={t("searchVideos")}
          onChange={(event) => update("q", event.target.value)}
        />
        <button type="submit" aria-label={t("search")} disabled={filtering}>
          {filtering ? <Loader2 className="spin" size={15} /> : <Search size={15} />}
        </button>
      </div>
      <details
        className="history-filters__advanced"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary><SlidersHorizontal size={14} />{t("advancedFilters")}</summary>
        <div className="history-filters__grid">
          <label><span>{t("status")}</span><select value={filters.status} onChange={(event) => update("status", event.target.value)}><option value="">{t("allStatuses")}</option><option value="UPLOADED">{t("uploaded")}</option><option value="PENDING_ANALYSIS">{t("pending")}</option><option value="PROCESSING">{t("processingStatus")}</option><option value="COMPLETED">{t("completed")}</option><option value="FAILED">{t("failed")}</option></select></label>
          <label><span>{t("dateFrom")}</span><input type="date" value={filters.dateFrom} onChange={(event) => update("dateFrom", event.target.value)} /></label>
          <label><span>{t("dateTo")}</span><input type="date" value={filters.dateTo} min={filters.dateFrom || undefined} onChange={(event) => update("dateTo", event.target.value)} /></label>
          <label><span>{t("minSize")}</span><input type="number" min="0" max="12288" step="1" value={filters.minSizeMb} onChange={(event) => update("minSizeMb", event.target.value)} /></label>
          <label><span>{t("maxSize")}</span><input type="number" min={filters.minSizeMb || "0"} max="12288" step="1" value={filters.maxSizeMb} onChange={(event) => update("maxSizeMb", event.target.value)} /></label>
          <label><span>{t("sortBy")}</span><select value={filters.sort} onChange={(event) => update("sort", event.target.value as VideoFilterState["sort"])}><option value="newest">{t("newest")}</option><option value="oldest">{t("oldest")}</option><option value="name-asc">{t("nameAsc")}</option><option value="name-desc">{t("nameDesc")}</option></select></label>
          <label><span>{t("resultsPerPage")}</span><select value={filters.pageSize} onChange={(event) => update("pageSize", Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label>
        </div>
        <div className="history-filters__actions">
          <button className="button ghost" type="button" onClick={onClear} disabled={filtering}>{t("clearFilters")}</button>
          <button className="button primary" type="submit" disabled={filtering}>{filtering ? <Loader2 className="spin" size={14} /> : null}{t("applyFilters")}</button>
        </div>
      </details>
    </form>
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

function formatStatus(status: string, locale: AppLocale = "es") {
  const labels: Record<string, [string, string]> = {
    UPLOADED: ["subido", "uploaded"],
    PENDING_ANALYSIS: ["pendiente", "pending"],
    PROCESSING: ["procesando", "processing"],
    COMPLETED: ["completado", "completed"],
    FAILED: ["fallido", "failed"],
    QUEUED: ["en cola", "queued"],
    RUNNING: ["en ejecución", "running"],
  };
  const translated = labels[status.toUpperCase()];
  return translated ? translated[locale === "en" ? 1 : 0] : status.toLowerCase().replaceAll("_", " ");
}

function getVideoStatusLabel(video: HistoryVideo, locale: AppLocale = "es") {
  if (video.latestJob?.cancelled) return locale === "en" ? "analysis cancelled" : "análisis cancelado";
  if (video.latestJob?.status === "QUEUED" && getVideoProgress(video) === 0) return locale === "en" ? "waiting for worker" : "esperando worker";
  return formatStatus(video.status, locale);
}

function getVideoStatusClass(video: HistoryVideo) {
  return video.latestJob?.cancelled ? "failed" : video.status.toLowerCase();
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

function formatVideoOpponent(video: HistoryVideo, locale: AppLocale = "es") {
  const english = locale === "en";
  const matchInfo = getVideoMatchInfo(video);
  if (matchInfo.ownTeam || matchInfo.rivalTeam) {
    return `${matchInfo.ownTeam ?? (english ? "Team 1" : "Equipo 1")} vs ${matchInfo.rivalTeam ?? (english ? "Team 2" : "Equipo 2")}`;
  }
  return english ? "No teams registered" : "Sin equipos registrados";
}

function StorageStatusInline({ video, locale = "es" }: { video: HistoryVideo; locale?: AppLocale }) {
  const labels = getStorageLabels(video);
  if (labels.length === 0) return null;

  const hasMissingOutput = labels.includes("Processed: Missing");
  const hasLocalOnlyOutput = labels.includes("Processed: Local");
  const tone = hasMissingOutput ? "warning" : hasLocalOnlyOutput ? "local" : "remote";
  const readableLabels = labels.map((label) => formatStorageLabel(label, locale));

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

function formatStorageLabel(label: string, locale: AppLocale = "es") {
  const english = locale === "en";
  switch (label) {
    case "Original: R2":
      return "Original R2";
    case "Original: Local":
      return english ? "Original local" : "Original local";
    case "Processed: R2":
      return english ? "Processed R2" : "Procesado R2";
    case "Processed: Local":
      return english ? "Processed locally" : "Procesado local";
    case "Processed: Missing":
      return english ? "Processed missing" : "Procesado faltante";
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

function getVideoPlaceholderMessage(video: HistoryVideo, locale: AppLocale = "es") {
  const english = locale === "en";
  const missingWarning = getProcessedMissingWarning(video);
  const warnings = getResilienceWarnings(video);
  if (missingWarning) return english ? missingWarning : "No se encontró el video procesado.";
  if (warnings.includes("ANALYSIS_INTERRUPTED")) return english ? "Analysis was interrupted." : "El análisis fue interrumpido.";
  if (video.status === "FAILED" && !video.latestJob?.error) return english ? "Analysis was interrupted." : "El análisis fue interrumpido.";
  if (video.latestJob?.error) return video.latestJob.error;
  if (video.latestJob?.status === "QUEUED" && getVideoProgress(video) === 0) return english ? "Waiting for worker..." : "Esperando worker...";
  if (video.latestJob) return `${english ? "Analyzing video" : "Analizando video"}... (${getVideoProgress(video)}%)`;
  return english ? "The worker will generate the annotated video and metrics." : "El worker generará el video anotado y las métricas.";
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
  locale: AppLocale = "es",
) {
  const english = locale === "en";
  const warning = getProcessedMissingWarning(video);
  if (warning) {
    pushToast(english ? "Analysis completed but the processed video was not found in R2 or local storage." : "El análisis terminó, pero no se encontró el video procesado en R2 ni en el almacenamiento local.", {
      tone: "warning",
      dedupeKey: `${video.id}:processed-missing`,
      durationMs: 9000,
    });
    return;
  }

  const labels = getStorageLabels(video);
  if (labels.includes("Processed: R2")) {
    pushToast(english ? "Analysis completed and the processed video was stored in Cloudflare R2." : "Análisis completado y video procesado guardado en Cloudflare R2.", {
      tone: "success",
      dedupeKey: `${video.id}:processed-r2`,
      durationMs: 9000,
    });
  } else if (labels.includes("Processed: Local")) {
    pushToast(english ? "Analysis completed. The processed video is only in local storage." : "Análisis completado. El video procesado está únicamente en el almacenamiento local.", {
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

function formatDate(value: string, locale: AppLocale = "es") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return locale === "en" ? "Date unavailable" : "Fecha no disponible";
  return HISTORY_DATE_FORMATTERS[locale === "en" ? "en" : "es"].format(date);
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

function hasAdvancedVideoFilters(filters: VideoFilterState) {
  return Boolean(
    filters.status ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.minSizeMb ||
    filters.maxSizeMb ||
    filters.sort !== DEFAULT_VIDEO_FILTERS.sort ||
    filters.pageSize !== DEFAULT_VIDEO_FILTERS.pageSize
  );
}

function hasActiveVideoFilters(filters: VideoFilterState) {
  return Boolean(filters.q || hasAdvancedVideoFilters(filters));
}

function formatKm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00";
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function formatPercentMetric(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.0";
  return value.toFixed(1);
}




