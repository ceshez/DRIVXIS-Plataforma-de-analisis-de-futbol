"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Film, Loader2, Upload, XCircle } from "lucide-react";
import { MicroGrid } from "@/components/micro-graphics";
import type { AnalysisMetrics } from "@/lib/analysis-metrics";

export type UploadedVideo = {
  id: string;
  originalFilename: string;
  status: string;
  sizeBytes: string;
  createdAt: string;
  metadata?: unknown;
  sourceVideoUrl?: string;
  processedVideoUrl?: string | null;
  latestJob?: {
    id: string;
    status: string;
    progress: number;
    error: string | null;
  } | null;
  latestMetrics?: AnalysisMetrics | null;
};

type VideoUploadDropzoneProps = {
  onUploaded?: (video: UploadedVideo) => void;
  onNotify?: (message: string, tone?: "success" | "info" | "warning") => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  disabledMessage?: string;
  progress?: number;
};

type UploadState = "idle" | "uploading" | "queued" | "error";

export function VideoUploadDropzone({
  onUploaded,
  onNotify,
  label = "Selecciona o arrastra un partido",
  description = "MP4, MOV, AVI o formatos compatibles con el pipeline.",
  disabled = false,
  disabledMessage = "Analizando video actual",
  progress,
}: VideoUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [message, setMessage] = useState("Click para abrir archivos");
  const presignDiagnosticRef = useRef("");
  const [fileName, setFileName] = useState("");
  const [ownTeam, setOwnTeam] = useState("");
  const [rivalTeam, setRivalTeam] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("drivxis:primary-team");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { name?: string };
      if (parsed.name) setOwnTeam(parsed.name);
    } catch {
      window.localStorage.removeItem("drivxis:primary-team");
    }
  }, []);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || state === "uploading" || disabled) return;
    await uploadVideo(file);
  }

  async function uploadVideo(file: File) {
    const normalizedOwnTeam = ownTeam.trim();
    const normalizedRivalTeam = rivalTeam.trim();
    if (normalizedOwnTeam.length < 2 || normalizedRivalTeam.length < 2) {
      setState("error");
      setMessage("Indica tu equipo y el rival antes de subir el partido.");
      return;
    }

    const requestedMimeType = file.type.trim();
    if (!requestedMimeType || !requestedMimeType.startsWith("video/")) {
      setState("error");
      setMessage("El archivo no tiene un MIME type de video válido.");
      return;
    }

    setState("uploading");
    setFileName(file.name);
    setMessage("Preparando carga");
    presignDiagnosticRef.current = "";
    const matchInfo = {
      ownTeam: normalizedOwnTeam,
      rivalTeam: normalizedRivalTeam,
    };

    const metadata = {
      filename: file.name,
      mimeType: requestedMimeType,
      sizeBytes: file.size,
    };
    let attemptedRemotePut = false;

    try {
      const presignResponse = await fetch("/api/videos/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const presign = (await presignResponse.json().catch(() => ({}))) as {
        error?: string;
        details?: string;
        configured?: boolean;
        provider?: "local" | "r2" | "s3-compatible";
        uploadMode?: "local" | "s3";
        uploadUrl?: string | null;
        objectKey?: string;
        signedContentType?: string;
        configErrors?: string[];
      };

      if (!presignResponse.ok || !presign.objectKey) {
        throw new Error(presign.details || presign.error || "No se pudo preparar la carga.");
      }

      const uploadUrlHost = getUploadUrlHost(presign.uploadUrl);
      const signedMimeType = (presign.signedContentType || metadata.mimeType).trim();
      const putContentType = file.type.trim();
      const isRequestedMimeMatch = putContentType === metadata.mimeType;
      const isSignedMimeMatch = putContentType === signedMimeType;

      presignDiagnosticRef.current =
        `Presign: configured=${String(Boolean(presign.configured))} | uploadMode=${presign.uploadMode || "unknown"} | uploadUrl=${String(Boolean(presign.uploadUrl))} | host=${uploadUrlHost || "null"}`;

      if (process.env.NODE_ENV === "development") {
        console.info("[DRIVXIS upload diagnostics]", {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          requestedMimeType: metadata.mimeType,
          presignMimeType: signedMimeType,
          mimeMatchRequestedVsFileType: isRequestedMimeMatch,
          mimeMatchSignedVsFileType: isSignedMimeMatch,
          uploadUrlHost,
          configured: Boolean(presign.configured),
          uploadMode: presign.uploadMode || "unknown",
          hasUploadUrl: Boolean(presign.uploadUrl),
        });
      }

      if (presign.uploadMode === "s3" && presign.uploadUrl) {
        const uploadStartMessage = "Subiendo a la nube... Esto puede tardar varios minutos"
        setMessage(uploadStartMessage);
        onNotify?.(uploadStartMessage, "info");
      } else {
        const fallbackReason = presign.configErrors?.[0] || "Almacenamiento remoto no configurado";
        const fallbackMessage = `Using local fallback. ${fallbackReason}`;
        setMessage(fallbackMessage);
        onNotify?.(fallbackMessage, "warning");
      }

      if (presign.uploadMode === "s3" && presign.uploadUrl) {
        if (!isRequestedMimeMatch || !isSignedMimeMatch) {
          throw new Error("Content-Type mismatch: the signed Content-Type must match the upload Content-Type.");
        }
        attemptedRemotePut = true;
        const uploadResponse = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": putContentType },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error(await describeRemoteUploadFailure(uploadResponse));
        }
        const successMessage = "Video original subido a la nube.";
        setMessage(successMessage);
        onNotify?.(successMessage, "success");
      } else {
        const localUploadResponse = await fetch(`/api/videos/local-upload?objectKey=${encodeURIComponent(presign.objectKey)}`, {
          method: "PUT",
          headers: { "Content-Type": metadata.mimeType },
          body: file,
        });
        const localUpload = (await localUploadResponse.json().catch(() => ({}))) as { error?: string };
        if (!localUploadResponse.ok) {
          throw new Error(localUpload.error || "No se pudo guardar el archivo local.");
        }
        const localSuccessMessage = "Video original guardado localmente. No se subió a la nube.";
        setMessage(localSuccessMessage);
        onNotify?.(localSuccessMessage, "warning");
      }

      setMessage("Registrando metadata");
      const createResponse = await fetch("/api/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...metadata, objectKey: presign.objectKey, uploadMode: presign.uploadMode || "local", matchInfo }),
      });
      const created = (await createResponse.json().catch(() => ({}))) as { error?: string; video?: UploadedVideo };
      if (!createResponse.ok || !created.video) {
        throw new Error(created.error || "No se pudo registrar el video.");
      }

      setState("queued");
      setMessage("Video en cola de análisis");
      window.localStorage.setItem(
        "drivxis:primary-team",
        JSON.stringify({ name: normalizedOwnTeam }),
      );
      onUploaded?.(created.video);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      const reason = normalizeUploadError(error, attemptedRemotePut);
      const prefixed = `Upload failed: ${reason}`;
      setState("error");
      setMessage(prefixed);
      onNotify?.(prefixed, "warning");
    }
  }

  const isBusy = state === "uploading" || disabled;
  const displayProgress = typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  return (
    <div className="analysis-upload">
      {!disabled ? (
        <div className="match-setup" aria-label="Datos del partido">
          <label>
            <span>Tu equipo</span>
            <input
              type="text"
              value={ownTeam}
              onChange={(event) => setOwnTeam(event.target.value)}
              placeholder="Ej. DRIVXIS FC"
              disabled={state === "uploading"}
            />
          </label>
          <label>
            <span>Rival</span>
            <input
              type="text"
              value={rivalTeam}
              onChange={(event) => setRivalTeam(event.target.value)}
              placeholder="Ej. Academia Norte"
              disabled={state === "uploading"}
            />
          </label>
        </div>
      ) : null}
      <button
        className={`analysis-upload__target ${dragOver ? "is-dragging" : ""}`}
        type="button"
        disabled={isBusy}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <MicroGrid />
        <span className="analysis-upload__icon">
          {state === "uploading" || disabled ? <Loader2 className="spin" size={30} /> : state === "queued" ? <CheckCircle2 size={30} /> : state === "error" ? <XCircle size={30} /> : <Upload size={30} />}
        </span>
        <strong>{disabled ? "análisis en curso" : fileName || label}</strong>
        <small>{disabled ? disabledMessage : state === "idle" ? description : message}</small>
        {displayProgress !== null ? (
          <span className="analysis-upload__progress" aria-label={`Progreso ${displayProgress}%`}>
            <span style={{ width: `${displayProgress}%` }} />
          </span>
        ) : null}
        <span className={`live-chip live-chip--small ${state === "uploading" || disabled ? "" : "live-chip--muted"}`}>
          <span />
          {disabled ? `${displayProgress ?? 0}%` : state === "uploading" ? "Subiendo" : state === "queued" ? "En cola" : state === "error" ? "Error" : "Listo"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="visually-hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      {state !== "idle" ? (
        <div className="analysis-upload__note">
          <Film size={14} />
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}

async function describeRemoteUploadFailure(response: Response) {
  const status = response.status;
  const safeText = await readSafeResponseText(response);
  if (status === 403) {
    const baseMessage = "R2 rejected the upload with 403. Possible SignatureDoesNotMatch or Content-Type mismatch.";
    return safeText ? `${baseMessage} ${safeText}` : baseMessage;
  }
  if (status === 400) {
    const baseMessage = "R2 rejected the upload request. Check bucket, object key, endpoint and headers.";
    return safeText ? `${baseMessage} ${safeText}` : baseMessage;
  }
  if (status >= 500) {
    return `Cloudflare R2 upload failed with server error (${status}).`;
  }

  return safeText ? `Cloudflare R2 upload failed (${status}). ${safeText}` : `Cloudflare R2 upload failed with status ${status}.`;
}

function normalizeUploadError(error: unknown, attemptedRemotePut: boolean) {
  if (attemptedRemotePut && error instanceof TypeError) {
    return "Browser network error during R2 PUT. This can be CORS, wrong endpoint, or blocked request.";
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "No se pudo completar la carga.";
}

function getUploadUrlHost(uploadUrl?: string | null) {
  if (!uploadUrl) return null;
  try {
    return new URL(uploadUrl).host;
  } catch {
    return null;
  }
}

async function readSafeResponseText(response: Response) {
  const rawText = await response.text().catch(() => "");
  return rawText.replace(/\s+/g, " ").trim().slice(0, 180);
}
