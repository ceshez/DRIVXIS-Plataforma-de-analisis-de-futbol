"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { CheckCircle2, Film, Loader2, Upload, XCircle } from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { MicroGrid } from "@/components/micro-graphics";
import type { AnalysisMetrics } from "@/lib/analysis-metrics";
import type { AppLocale } from "@/lib/preferences";

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
type UploadDiagnostics = {
  uploadUrlHost: string | null;
  uploadMode: "s3" | "local" | "unknown";
  provider: "local" | "r2" | "s3-compatible" | "unknown";
  signedMimeType: string;
  uploadMimeType: string;
  uploadHeaderNames: string[];
};

type UploadFormState = {
  status: UploadState;
  message: string;
  fileName: string;
  ownTeam: string;
  rivalTeam: string;
};

type UploadFormAction =
  | { type: "patch"; changes: Partial<UploadFormState> }
  | { type: "teamChanged"; team: "ownTeam" | "rivalTeam"; value: string };

type MatchSetupProps = {
  ownTeam: string;
  rivalTeam: string;
  uploading: boolean;
  locale: AppLocale;
  onTeamChanged: (team: "ownTeam" | "rivalTeam", value: string) => void;
};

const INITIAL_UPLOAD_FORM_STATE: UploadFormState = {
  status: "idle",
  message: "Click para abrir archivos",
  fileName: "",
  ownTeam: "",
  rivalTeam: "",
};

function uploadFormReducer(state: UploadFormState, action: UploadFormAction): UploadFormState {
  if (action.type === "teamChanged") {
    return { ...state, [action.team]: action.value };
  }
  return { ...state, ...action.changes };
}

function MatchSetup({ ownTeam, rivalTeam, uploading, locale, onTeamChanged }: MatchSetupProps) {
  const english = locale === "en";
  return (
    <div className="match-setup" aria-label={english ? "Match details" : "Datos del partido"}>
      <label>
        <span>{english ? "Your team" : "Tu equipo"}</span>
        <input
          type="text"
          value={ownTeam}
          onChange={(event) => onTeamChanged("ownTeam", event.target.value)}
          placeholder={english ? "e.g. DRIVXIS FC" : "Ej. DRIVXIS FC"}
          disabled={uploading}
        />
      </label>
      <label>
        <span>{english ? "Opponent" : "Rival"}</span>
        <input
          type="text"
          value={rivalTeam}
          onChange={(event) => onTeamChanged("rivalTeam", event.target.value)}
          placeholder={english ? "e.g. North Academy" : "Ej. Academia Norte"}
          disabled={uploading}
        />
      </label>
    </div>
  );
}

export function VideoUploadDropzone({
  onUploaded,
  onNotify,
  label = "Selecciona o arrastra un partido",
  description = "MP4, MOV, AVI o formatos compatibles con el pipeline.",
  disabled = false,
  disabledMessage = "Analizando video actual",
  progress,
}: VideoUploadDropzoneProps) {
  const { locale } = useAppPreferences();
  const english = locale === "en";
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadForm, dispatchUploadForm] = useReducer(uploadFormReducer, INITIAL_UPLOAD_FORM_STATE);
  const { status, message, fileName, ownTeam, rivalTeam } = uploadForm;
  const uploadDiagnosticsRef = useRef<UploadDiagnostics>({
    uploadUrlHost: null,
    uploadMode: "unknown",
    provider: "unknown",
    signedMimeType: "",
    uploadMimeType: "",
    uploadHeaderNames: [],
  });

  useEffect(() => {
    const saved = window.localStorage.getItem("drivxis:primary-team");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { name?: string };
      if (parsed.name) dispatchUploadForm({ type: "teamChanged", team: "ownTeam", value: parsed.name });
    } catch {
      window.localStorage.removeItem("drivxis:primary-team");
    }
  }, []);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file || status === "uploading" || disabled) return;
    await uploadVideo(file);
  }

  async function uploadVideo(file: File) {
    const normalizedOwnTeam = ownTeam.trim();
    const normalizedRivalTeam = rivalTeam.trim();
    if (normalizedOwnTeam.length < 2 || normalizedRivalTeam.length < 2) {
      dispatchUploadForm({
        type: "patch",
        changes: { status: "error", message: english ? "Enter your team and opponent before uploading the match." : "Indica tu equipo y el rival antes de subir el partido." },
      });
      return;
    }

    const requestedMimeType = file.type.trim();
    if (!requestedMimeType || !requestedMimeType.startsWith("video/")) {
      dispatchUploadForm({
        type: "patch",
        changes: { status: "error", message: english ? "The selected file is not a valid video." : "El archivo no tiene un MIME type de video válido." },
      });
      return;
    }

    dispatchUploadForm({
      type: "patch",
      changes: { status: "uploading", fileName: file.name, message: english ? "Preparing upload" : "Preparando carga" },
    });
    uploadDiagnosticsRef.current = {
      uploadUrlHost: null,
      uploadMode: "unknown",
      provider: "unknown",
      signedMimeType: "",
      uploadMimeType: file.type.trim(),
      uploadHeaderNames: [],
    };
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
        throw new Error(presign.details || presign.error || (english ? "The upload could not be prepared." : "No se pudo preparar la carga."));
      }

      const uploadUrlHost = getUploadUrlHost(presign.uploadUrl);
      const signedMimeType = (presign.signedContentType || metadata.mimeType).trim();
      const putContentType = file.type.trim();
      const isRequestedMimeMatch = putContentType === metadata.mimeType;
      const isSignedMimeMatch = putContentType === signedMimeType;

      uploadDiagnosticsRef.current = {
        uploadUrlHost,
        uploadMode: presign.uploadMode || "unknown",
        provider: presign.provider || "unknown",
        signedMimeType,
        uploadMimeType: putContentType,
        uploadHeaderNames: [],
      };

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
        const uploadStartMessage = english ? "Uploading to the cloud... This may take several minutes" : "Subiendo a la nube... Esto puede tardar varios minutos";
        dispatchUploadForm({ type: "patch", changes: { message: uploadStartMessage } });
        onNotify?.(uploadStartMessage, "info");
      } else {
        const fallbackReason = presign.configErrors?.[0] || (english ? "Remote storage is not configured" : "Almacenamiento remoto no configurado");
        const fallbackMessage = `${english ? "Using local storage" : "Usando almacenamiento local"}. ${fallbackReason}`;
        dispatchUploadForm({ type: "patch", changes: { message: fallbackMessage } });
        onNotify?.(fallbackMessage, "warning");
      }

      if (presign.uploadMode === "s3" && presign.uploadUrl) {
        if (!uploadUrlHost) {
          throw new Error("Presigned upload URL is malformed and could not be parsed.");
        }
        if (!presign.uploadUrl.startsWith("https://")) {
          throw new Error("Presigned upload URL must use HTTPS.");
        }
        if (isCloudflareR2DevHost(uploadUrlHost)) {
          throw new Error(
            "Presigned URL host points to r2.dev. Configure STORAGE_ENDPOINT with https://<ACCOUNT_ID>.r2.cloudflarestorage.com for direct browser PUT uploads.",
          );
        }
        if (!isRequestedMimeMatch || !isSignedMimeMatch) {
          throw new Error("Content-Type mismatch: the signed Content-Type must match the upload Content-Type.");
        }
        const remotePutHeaders: Record<string, string> = { "Content-Type": signedMimeType };
        uploadDiagnosticsRef.current = {
          ...uploadDiagnosticsRef.current,
          uploadHeaderNames: Object.keys(remotePutHeaders),
          uploadMimeType: remotePutHeaders["Content-Type"],
        };
        attemptedRemotePut = true;
        if (process.env.NODE_ENV === "development") {
          console.info("[DRIVXIS upload request]", {
            presignedHost: uploadUrlHost,
            signedContentType: signedMimeType,
            browserUploadContentType: remotePutHeaders["Content-Type"],
            uploadHeaderNames: Object.keys(remotePutHeaders),
            hasUnexpectedExtraHeaders: Object.keys(remotePutHeaders).some((header) => header.toLowerCase() !== "content-type"),
          });
        }
        const uploadResponse = await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: remotePutHeaders,
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error(await describeRemoteUploadFailure(uploadResponse));
        }
        const successMessage = english ? "Original video uploaded to the cloud." : "Video original subido a la nube.";
        dispatchUploadForm({ type: "patch", changes: { message: successMessage } });
        onNotify?.(successMessage, "success");
      } else {
        const localUploadResponse = await fetch(`/api/videos/local-upload?objectKey=${encodeURIComponent(presign.objectKey)}`, {
          method: "PUT",
          headers: { "Content-Type": metadata.mimeType },
          body: file,
        });
        const localUpload = (await localUploadResponse.json().catch(() => ({}))) as { error?: string };
        if (!localUploadResponse.ok) {
          throw new Error(localUpload.error || (english ? "The local file could not be saved." : "No se pudo guardar el archivo local."));
        }
        const localSuccessMessage = english ? "Original video saved locally; it was not uploaded to the cloud." : "Video original guardado localmente. No se subió a la nube.";
        dispatchUploadForm({ type: "patch", changes: { message: localSuccessMessage } });
        onNotify?.(localSuccessMessage, "warning");
      }

      dispatchUploadForm({ type: "patch", changes: { message: english ? "Registering metadata" : "Registrando metadata" } });
      const createResponse = await fetch("/api/videos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...metadata, objectKey: presign.objectKey, uploadMode: presign.uploadMode || "local", matchInfo }),
      });
      const created = (await createResponse.json().catch(() => ({}))) as { error?: string; video?: UploadedVideo };
      if (!createResponse.ok || !created.video) {
        throw new Error(created.error || (english ? "The video could not be registered." : "No se pudo registrar el video."));
      }

      dispatchUploadForm({
        type: "patch",
        changes: { status: "queued", message: english ? "Video queued for analysis" : "Video en cola de análisis" },
      });
      window.localStorage.setItem(
        "drivxis:primary-team",
        JSON.stringify({ name: normalizedOwnTeam }),
      );
      onUploaded?.(created.video);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      const reason = normalizeUploadError(error, attemptedRemotePut, uploadDiagnosticsRef.current);
      const prefixed = `${english ? "Upload failed" : "Falló la carga"}: ${reason}`;
      dispatchUploadForm({ type: "patch", changes: { status: "error", message: prefixed } });
      onNotify?.(prefixed, "warning");
    }
  }

  const isBusy = status === "uploading" || disabled;
  const displayProgress = typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  return (
    <div className="analysis-upload" aria-busy={isBusy}>
      {!disabled ? (
        <MatchSetup
          ownTeam={ownTeam}
          rivalTeam={rivalTeam}
          uploading={status === "uploading"}
          locale={locale}
          onTeamChanged={(team, value) => dispatchUploadForm({ type: "teamChanged", team, value })}
        />
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
          {status === "uploading" || disabled ? <Loader2 className="spin" size={30} /> : status === "queued" ? <CheckCircle2 size={30} /> : status === "error" ? <XCircle size={30} /> : <Upload size={30} />}
        </span>
        <strong>{disabled ? (english ? "analysis in progress" : "análisis en curso") : fileName || label}</strong>
        <small>{disabled ? disabledMessage : status === "idle" ? description : message}</small>
        {displayProgress !== null ? (
          <span className="analysis-upload__progress" aria-label={`${english ? "Progress" : "Progreso"} ${displayProgress}%`}>
            <span style={{ width: `${displayProgress}%` }} />
          </span>
        ) : null}
        <span className={`live-chip live-chip--small ${status === "uploading" || disabled ? "" : "live-chip--muted"}`}>
          <span />
          {disabled ? `${displayProgress ?? 0}%` : status === "uploading" ? (english ? "Uploading" : "Subiendo") : status === "queued" ? (english ? "Queued" : "En cola") : status === "error" ? "Error" : (english ? "Ready" : "Listo")}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="visually-hidden"
        aria-label={english ? "Select video file" : "Seleccionar archivo de video"}
        onChange={(event) => void handleFiles(event.target.files)}
      />
      {status !== "idle" ? (
        <div className="analysis-upload__note" role="status" aria-live="polite">
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

function normalizeUploadError(error: unknown, attemptedRemotePut: boolean, diagnostics: UploadDiagnostics) {
  if (attemptedRemotePut && error instanceof TypeError) {
    const hostLabel = diagnostics.uploadUrlHost ? `host=${diagnostics.uploadUrlHost}` : "host=unknown";
    const signedType = diagnostics.signedMimeType || "unknown";
    const browserType = diagnostics.uploadMimeType || "unknown";
    const sentHeaders = diagnostics.uploadHeaderNames.length ? diagnostics.uploadHeaderNames.join(",") : "none";
    return `Browser network error during presigned PUT (${hostLabel}). signedContentType=${signedType}; uploadContentType=${browserType}; headers=${sentHeaders}. Next check in Network tab: OPTIONS preflight should succeed, then PUT should return a concrete status (403 usually means SignatureDoesNotMatch or signed-header mismatch).`;
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

function isCloudflareR2DevHost(host: string) {
  return host.endsWith(".r2.dev");
}

async function readSafeResponseText(response: Response) {
  const rawText = await response.text().catch(() => "");
  return rawText.replace(/\s+/g, " ").trim().slice(0, 180);
}
