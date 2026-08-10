"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";
import {
  type ReportDownloadState,
  getPdfDownloadFilename,
  getReportDownloadLabel,
  readPdfResponse,
  triggerPdfDownload,
  waitForNextPaint,
} from "@/lib/pdf-download";

export type ReportToastOptions = {
  tone?: "success" | "info" | "warning";
  durationMs?: number;
  sound?: boolean;
};

type ReportDownloadButtonProps = {
  videoId: string;
  onToast: (message: string, options?: ReportToastOptions) => void;
  className?: string;
};

export function ReportDownloadButton({
  videoId,
  onToast,
  className = "button ghost command-button",
}: ReportDownloadButtonProps) {
  const { locale } = useAppPreferences();
  const english = locale === "en";
  const [download, setDownload] = useState<ReportDownloadState>({ phase: "idle", bytesPerSecond: 0 });

  async function downloadReport() {
    if (download.phase !== "idle") return;

    setDownload({ phase: "preparing", bytesPerSecond: 0 });
    try {
      const response = await fetch(`/api/videos/${videoId}/analysis/report`, { cache: "no-store" });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || (english ? "The PDF report could not be prepared." : "No se pudo preparar el reporte PDF."));
      }

      const blob = await readPdfResponse(response, (bytesPerSecond) => {
        setDownload({ phase: "downloading", bytesPerSecond });
      });
      await waitForNextPaint();
      triggerPdfDownload(blob, getPdfDownloadFilename(response.headers.get("content-disposition")));
      onToast(english ? "PDF report downloaded." : "Reporte PDF descargado.", { durationMs: 7000, sound: true });
    } catch (error) {
      onToast(error instanceof Error ? error.message : (english ? "The PDF report could not be downloaded." : "No se pudo descargar el reporte PDF."), {
        tone: "warning",
        durationMs: 9000,
      });
    } finally {
      setDownload({ phase: "idle", bytesPerSecond: 0 });
    }
  }

  return (
    <button
      className={className}
      type="button"
      onClick={() => void downloadReport()}
      disabled={download.phase !== "idle"}
      aria-busy={download.phase !== "idle"}
    >
      {download.phase !== "idle" ? <Loader2 className="spin" size={14} /> : <FileDown size={14} />}
      {getReportDownloadLabel(download, locale)}
    </button>
  );
}
