export type ReportDownloadState = {
  phase: "idle" | "preparing" | "downloading";
  bytesPerSecond: number;
};

export async function readPdfResponse(response: Response, onProgress: (bytesPerSecond: number) => void) {
  if (!response.body) return response.blob();

  const reader = response.body.getReader();
  const chunks: ArrayBuffer[] = [];
  let receivedBytes = 0;
  const startedAt = performance.now();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk.buffer);
    receivedBytes += value.byteLength;
    const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
    onProgress(receivedBytes / elapsedSeconds);
  }

  return new Blob(chunks, { type: "application/pdf" });
}

export function triggerPdfDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function getPdfDownloadFilename(contentDisposition: string | null) {
  const encodedFilename = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encodedFilename) {
    try {
      return decodeURIComponent(encodedFilename);
    } catch {
      // Fall through to a stable filename.
    }
  }
  return "reporte-de-analisis.pdf";
}

export function getReportDownloadLabel(download: ReportDownloadState, locale: "es" | "en" = "es") {
  const english = locale === "en";
  if (download.phase === "preparing") return english ? "Preparing PDF..." : "Preparando PDF...";
  if (download.phase === "downloading") return `${english ? "Downloading" : "Descargando"} · ${formatTransferRate(download.bytesPerSecond)}`;
  return english ? "Download PDF" : "Descargar PDF";
}

export function waitForNextPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

function formatTransferRate(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 KB/s";
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
}
