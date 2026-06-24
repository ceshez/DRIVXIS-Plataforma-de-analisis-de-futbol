"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { MicroGrid } from "@/components/micro-graphics";

type AnalysisProcessingPanelProps = {
  variant?: "processing" | "failed";
  title?: string;
  filename: string;
  progress?: number;
  note: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function AnalysisProcessingPanel({
  variant = "processing",
  title,
  filename,
  progress = 0,
  note,
  actionLabel,
  onAction,
}: AnalysisProcessingPanelProps) {
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? Math.round(progress) : 0));

  return (
    <div
      className={`analysis-result-panel ${variant === "failed" ? "analysis-result-panel--failed" : "analysis-result-panel--processing"}`}
      role={variant === "processing" ? "status" : undefined}
      aria-live={variant === "processing" ? "polite" : undefined}
      aria-busy={variant === "processing"}
    >
      <MicroGrid />
      <div className="analysis-result-panel__inner">
        <span className="analysis-upload__icon">
          {variant === "failed" ? <AlertTriangle size={30} /> : <Loader2 className="spin" size={30} aria-hidden="true" />}
        </span>
        <div>
          <strong>{title ?? (variant === "failed" ? "Analisis fallido" : filename)}</strong>
          <small>{variant === "failed" ? filename : `Analizando video... (${safeProgress}%)`}</small>
        </div>
        {variant === "processing" ? (
          <span className="analysis-upload__progress" aria-label={`Progreso ${safeProgress}%`}>
            <span style={{ width: `${safeProgress}%` }} />
          </span>
        ) : null}
        <span className="analysis-result-panel__meta">{note}</span>
        {variant === "failed" && actionLabel && onAction ? (
          <button className="button ghost command-button analysis-result-panel__action" type="button" onClick={onAction}>
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
