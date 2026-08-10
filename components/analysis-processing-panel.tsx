"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { MicroGrid } from "@/components/micro-graphics";
import { useAppPreferences } from "@/components/app-preferences-provider";

type AnalysisProcessingPanelProps = {
  variant?: "processing" | "failed";
  title?: string;
  filename: string;
  progress?: number;
  note: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
};

export function AnalysisProcessingPanel({
  variant = "processing",
  title,
  filename,
  progress = 0,
  note,
  actionLabel,
  onAction,
  actionDisabled = false,
}: AnalysisProcessingPanelProps) {
  const { locale } = useAppPreferences();
  const english = locale === "en";
  const safeProgress = Math.max(0, Math.min(100, Number.isFinite(progress) ? Math.round(progress) : 0));
  const isWaitingForWorker = variant === "processing" && safeProgress === 0;
  const processingLabel = isWaitingForWorker ? (english ? "Waiting for worker..." : "Esperando worker...") : `${english ? "Analyzing video" : "Analizando video"}... (${safeProgress}%)`;

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
          <strong>{title ?? (variant === "failed" ? (english ? "Analysis failed" : "Análisis fallido") : filename)}</strong>
          <small>{variant === "failed" ? filename : processingLabel}</small>
        </div>
        {variant === "processing" ? (
          <span className="analysis-upload__progress" aria-label={isWaitingForWorker ? (english ? "Waiting for worker" : "Esperando worker") : `${english ? "Progress" : "Progreso"} ${safeProgress}%`}>
            <span style={{ width: `${safeProgress}%` }} />
          </span>
        ) : null}
        <span className="analysis-result-panel__meta">{note}</span>
        {actionLabel ? (
          <button
            className="button ghost command-button analysis-result-panel__action"
            type="button"
            onClick={onAction}
            disabled={actionDisabled || !onAction}
            aria-busy={actionDisabled}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
