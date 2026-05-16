"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type AnalysisVideoPlayerProps = {
  src: string;
  title: string;
  className?: string;
  onStreamError?: (message: string) => void;
};

export function AnalysisVideoPlayer({ src, title, className = "", onStreamError }: AnalysisVideoPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamError, setStreamError] = useState<{ src: string; message: string } | null>(null);

  async function tryLockLandscape() {
    const orientation = window.screen?.orientation;
    if (!orientation || typeof orientation.lock !== "function") return;
    try {
      await orientation.lock("landscape");
    } catch {
      // Some mobile browsers block orientation lock outside trusted fullscreen contexts.
    }
  }

  async function tryUnlockOrientation() {
    const orientation = window.screen?.orientation;
    if (!orientation || typeof orientation.unlock !== "function") return;
    try {
      orientation.unlock();
    } catch {
      // Ignore unlock failures on unsupported/restricted browsers.
    }
  }

  useEffect(() => {
    function syncFullscreenState() {
      const isShellFullscreen = document.fullscreenElement === shellRef.current;
      setIsFullscreen(isShellFullscreen);
      if (!isShellFullscreen) {
        void tryUnlockOrientation();
      }
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  async function toggleFullscreen() {
    const target = shellRef.current;
    if (!target) return;

    if (document.fullscreenElement === target) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }

    await target.requestFullscreen();
    await tryLockLandscape();
  }

  async function handlePlaybackError() {
    const fallbackMessage = "No se pudo reproducir el video procesado.";
    try {
      const response = await fetch(src, {
        method: "GET",
        headers: { range: "bytes=0-1" },
        cache: "no-store",
      });
      if (response.ok) {
        setStreamError({ src, message: fallbackMessage });
        onStreamError?.(fallbackMessage);
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        details?: { remoteError?: string };
      };
      const detail = payload.details?.remoteError ? ` (${payload.details.remoteError})` : "";
      const message = payload.error
        ? `${payload.error}${payload.code ? ` [${payload.code}]` : ""}${detail}`
        : `${fallbackMessage}${detail}`;
      setStreamError({ src, message });
      onStreamError?.(message);
    } catch {
      const networkMessage = "No se pudo cargar el stream. Verifica red, sesion o configuracion de storage.";
      setStreamError({ src, message: networkMessage });
      onStreamError?.(networkMessage);
    }
  }

  const activeStreamError = streamError?.src === src ? streamError.message : "";

  return (
    <div className={`analysis-video-shell ${isFullscreen ? "is-fullscreen" : ""} ${className}`} ref={shellRef}>
      <video
        key={src}
        className="analysis-video"
        src={src}
        controls
        preload="metadata"
        title={title}
        onError={() => {
          void handlePlaybackError();
        }}
      />
      <button
        className="video-fullscreen-button"
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? "Volver al tamaño normal" : "Ver video en pantalla completa"}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
      {activeStreamError ? <p className="history-muted">{activeStreamError}</p> : null}
    </div>
  );
}
