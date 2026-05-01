"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

type AnalysisVideoPlayerProps = {
  src: string;
  title: string;
  className?: string;
};

export function AnalysisVideoPlayer({ src, title, className = "" }: AnalysisVideoPlayerProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function syncFullscreenState() {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
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
  }

  return (
    <div className={`analysis-video-shell ${isFullscreen ? "is-fullscreen" : ""} ${className}`} ref={shellRef}>
      <video
        key={src}
        className="analysis-video"
        src={src}
        controls
        preload="metadata"
        title={title}
      />
      <button
        className="video-fullscreen-button"
        type="button"
        onClick={() => void toggleFullscreen()}
        aria-label={isFullscreen ? "Volver al tamano normal" : "Ver video en pantalla completa"}
      >
        {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
      </button>
    </div>
  );
}
