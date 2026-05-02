"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Film, Loader2, MoreVertical, RotateCcw, Trash2 } from "lucide-react";
import { AnalysisVideoPlayer } from "@/components/analysis-video-player";
import { ToastViewport, useAppToasts } from "@/components/app-toast";
import { MatchColorEditor } from "@/components/match-color-editor";
import { getMetricDisplay, type AnalysisMetrics } from "@/lib/analysis-metrics";

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
};

export function VideoHistory({ initialVideos }: VideoHistoryProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [selectedId, setSelectedId] = useState(initialVideos[0]?.id ?? "");
  const [retrying, setRetrying] = useState(false);
  const [openMenu, setOpenMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toasts, pushToast, dismissToast } = useAppToasts();
  const selected = useMemo(
    () => videos.find((video) => video.id === selectedId) ?? videos[0] ?? null,
    [selectedId, videos],
  );
  const deleteTarget = useMemo(
    () => videos.find((video) => video.id === deleteTargetId) ?? null,
    [deleteTargetId, videos],
  );
  const display = getMetricDisplay(selected?.latestMetrics ?? null);
  const ownDistanceKm = getOwnDistanceKm(selected?.latestMetrics ?? null);
  const rivalDistanceKm = getRivalDistanceKm(selected?.latestMetrics ?? null);

  useEffect(() => {
    if (!selected && videos[0]) {
      setSelectedId(videos[0].id);
    }
  }, [selected, videos]);

  const shouldPollSelected = selected ? isVideoProcessing(selected) : false;

  useEffect(() => {
    if (!selected || !shouldPollSelected) return;

    const eventSource = new EventSource(`/api/videos/${selected.id}/events`);
    eventSource.addEventListener("video", (event) => {
      const nextVideo = JSON.parse((event as MessageEvent).data) as HistoryVideo;
      setVideos((current) => {
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
        eventSource.close();
      }
    });
    eventSource.onerror = () => {
      eventSource.close();
      void refreshVideo(selected.id);
    };

    return () => {
      eventSource.close();
    };
  }, [selected?.id, shouldPollSelected, pushToast]);

  useEffect(() => {
    if (!openMenu) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.closest("[data-video-menu-surface]")) return;
      setOpenMenu(null);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setDeleteTargetId(null);
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
      }
      return current.map((video) => (video.id === data.video!.id ? data.video! : video));
    });
  }

  async function retryAnalysis() {
    if (!selected) return;
    setRetrying(true);
    const response = await fetch(`/api/videos/${selected.id}/analysis/retry`, { method: "POST" });
    const data = (await response.json().catch(() => ({}))) as { video?: HistoryVideo };
    setRetrying(false);
    if (!response.ok || !data.video) return;
    setVideos((current) => current.map((video) => (video.id === data.video!.id ? data.video! : video)));
    setSelectedId(data.video.id);
    setOpenMenu(null);
    pushToast("Video recibido. Iniciando análisis.", {
      dedupeKey: `${data.video.id}:queued`,
      durationMs: 7000,
      sound: true,
    });
  }

  async function deleteVideo() {
    if (!deleteTarget) return;
    setDeleting(true);
    const response = await fetch(`/api/videos/${deleteTarget.id}`, { method: "DELETE" });
    const data = (await response.json().catch(() => ({}))) as { deletedId?: string };
    setDeleting(false);
    if (!response.ok || !data.deletedId) return;

    setVideos((current) => {
      const nextVideos = current.filter((video) => video.id !== data.deletedId);
      if (selectedId === data.deletedId) {
        setSelectedId(nextVideos[0]?.id ?? "");
      }
      return nextVideos;
    });
    setOpenMenu(null);
    setDeleteTargetId(null);
  }

  return (
    <>
      <section className="history-workspace">
        <div className="history-list lab-panel">
          <div className="panel-heading">
            <div>
              <span>Historial</span>
              <h2>Partidos subidos</h2>
            </div>
          </div>

          {videos.length === 0 ? (
            <div className="empty-state">
              <Film size={24} />
              <strong>No hay partidos todavía.</strong>
              <span>Sube un video desde el panel principal para activar el análisis.</span>
            </div>
          ) : (
            <div className="video-list">
              {videos.map((video) => (
                <article
                  className={`video-row video-row--shell ${video.id === selected?.id ? "is-selected" : ""}`}
                  key={video.id}
                >
                  <button
                    className="video-row__select"
                    type="button"
                    onClick={() => setSelectedId(video.id)}
                  >
                    <span className="video-row__icon">
                      <Film size={17} />
                    </span>
                    <div className="video-row__copy">
                      <strong>{video.originalFilename}</strong>
                      <span>{formatVideoOpponent(video)}</span>
                    </div>
                    <span className="video-row__meta">
                      {formatDate(video.createdAt)}
                      <br />
                      {formatBytes(Number(video.sizeBytes))}
                    </span>
                    <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
                  </button>

                  <div className="video-row__actions">
                    <button
                      className="icon-button icon-button--compact"
                      type="button"
                      aria-label={`Abrir acciones para ${video.originalFilename}`}
                      aria-expanded={openMenu?.id === video.id}
                      onClick={(event) => {
                        const rect = event.currentTarget.getBoundingClientRect();
                        setOpenMenu((current) =>
                          current?.id === video.id
                            ? null
                            : {
                                id: video.id,
                                x: Math.max(16, rect.right - 220),
                                y: rect.bottom + 8,
                              },
                        );
                      }}
                    >
                      <MoreVertical size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="history-detail lab-panel">
          <div className="panel-heading">
            <div>
              <span>Detalle del partido</span>
              <h2>{selected?.originalFilename ?? "Sin selección"}</h2>
            </div>
            {selected ? <span className={`status-pill ${selected.status.toLowerCase()}`}>{formatStatus(selected.status)}</span> : null}
          </div>

          {selected ? (
            <>
              {selected.status === "COMPLETED" && getProcessedVideoUrl(selected) ? (
                <>
                  <AnalysisVideoPlayer
                    src={getProcessedVideoUrl(selected) ?? `/api/videos/${selected.id}/stream?variant=processed`}
                    title={selected.originalFilename}
                  />
                  <MatchColorEditor
                    video={selected}
                    onToast={(message) => pushToast(message, { durationMs: 7000, sound: true })}
                    onSaved={(nextVideo) => {
                      setVideos((current) => current.map((video) => (video.id === nextVideo.id ? nextVideo : video)));
                    }}
                  />
                </>
              ) : (
                <div className="analysis-placeholder">
                  {isVideoProcessing(selected) ? <Loader2 className="spin" size={24} /> : <BarChart3 size={24} />}
                  <strong>{selected.latestJob ? `análisis ${formatStatus(selected.latestJob.status)}` : "análisis en espera"}</strong>
                  <span>
                    {selected.latestJob?.error ||
                      (selected.latestJob ? `Analizando video... (${getVideoProgress(selected)}%)` : "El worker generará el video anotado y las métricas.")}
                  </span>
                  {isVideoProcessing(selected) ? (
                    <span className="analysis-upload__progress" aria-label={`Progreso ${getVideoProgress(selected)}%`}>
                      <span style={{ width: `${getVideoProgress(selected)}%` }} />
                    </span>
                  ) : null}
                </div>
              )}

              <div className="history-stat-grid">
                <MetricTile label="Posesión Equipo 1" value={display.possession} unit="%" />
                <MetricTile label="Posesión Equipo 2" value={display.rivalPossession} unit="%" />
                <MetricTile label="Dist. equipo propio" value={formatKm(ownDistanceKm)} unit="km" />
                <MetricTile label="Dist. equipo rival" value={formatKm(rivalDistanceKm)} unit="km" />
              </div>

              <button className="button ghost command-button" type="button" onClick={() => void retryAnalysis()} disabled={retrying}>
                {retrying ? <Loader2 className="spin" size={14} /> : <RotateCcw size={14} />}
                Reanalizar
              </button>
            </>
          ) : (
            <div className="empty-state">
              <BarChart3 size={24} />
              <strong>Sin partido seleccionado.</strong>
              <span>El historial mostrará las métricas específicas de cada video.</span>
            </div>
          )}
        </aside>
      </section>

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
                onClick={() => {
                  setDeleteTargetId(openMenu.id);
                  setOpenMenu(null);
                }}
              >
                <Trash2 size={14} />
                Eliminar partido
              </button>
            </div>,
            document.body,
          )
        : null}

      {deleteTarget ? (
        <div className="history-modal-backdrop" role="presentation" onClick={() => setDeleteTargetId(null)}>
          <div
            className="history-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-delete-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="history-modal__eyebrow">Confirmación</div>
            <h2 id="history-delete-title">Eliminar partido del historial</h2>
            <p>
              Se eliminará <strong>{deleteTarget.originalFilename}</strong>, su video original, el video anotado
              y las métricas generadas por el modelo.
            </p>
            <div className="history-modal__actions">
              <button className="button ghost" type="button" onClick={() => setDeleteTargetId(null)} disabled={deleting}>
                Cancelar
              </button>
              <button className="button danger" type="button" onClick={() => void deleteVideo()} disabled={deleting}>
                {deleting ? <Loader2 className="spin" size={14} /> : <Trash2 size={14} />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

function MetricTile({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <article className="stat-cell history-stat" title={`${label}: ${value}${unit}`} aria-label={`${label}: ${value}${unit}`}>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <span className="meter">
        <span style={{ width: `${Math.min(100, Number(value) || 0)}%` }} />
      </span>
    </article>
  );
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

function getProcessedVideoUrl(video: HistoryVideo) {
  return video.processedVideoUrl || null;
}

function getVideoMatchInfo(video: HistoryVideo) {
  const metadata = video.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const matchInfo = (metadata as { matchInfo?: unknown }).matchInfo;
  if (!matchInfo || typeof matchInfo !== "object" || Array.isArray(matchInfo)) return {};
  return matchInfo as { ownTeam?: string; rivalTeam?: string };
}

function formatVideoOpponent(video: HistoryVideo) {
  const matchInfo = getVideoMatchInfo(video);
  if (matchInfo.ownTeam || matchInfo.rivalTeam) {
    return `${matchInfo.ownTeam ?? "Equipo 1"} vs ${matchInfo.rivalTeam ?? "Equipo 2"}`;
  }
  return "Sin equipos registrados";
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




