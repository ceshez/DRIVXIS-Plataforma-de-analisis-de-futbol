"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Film, Loader2, Play, SkipForward, Upload, XCircle } from "lucide-react";
import { CornerMarks, Crosshair, MicroGrid } from "@/components/micro-graphics";

type VideoRecord = {
  id: string;
  originalFilename: string;
  status: string;
  sizeBytes: string | number;
  createdAt: string;
};

type UploadPanelProps = {
  initialVideos: VideoRecord[];
};

const analysisSteps = ["Validar archivo", "Preparar storage", "Guardar metadata", "Cola de análisis"];

export function UploadPanel({ initialVideos }: UploadPanelProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const input = event.currentTarget.elements.namedItem("video") as HTMLInputElement;
    const file = selectedFile || input.files?.[0];
    if (!file) {
      setMessage("Selecciona un video para registrar.");
      return;
    }

    setBusy(true);
    const metadata = {
      filename: file.name,
      mimeType: file.type || "video/mp4",
      sizeBytes: file.size,
    };

    const presignResponse = await fetch("/api/videos/presign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(metadata),
    });

    const presign = (await presignResponse.json().catch(() => ({}))) as {
      error?: string;
      configured?: boolean;
      uploadUrl?: string | null;
      objectKey?: string;
    };

    if (!presignResponse.ok || !presign.objectKey) {
      setBusy(false);
      setMessage(presign.error || "No se pudo preparar la carga.");
      return;
    }

    if (presign.uploadUrl) {
      const uploadResponse = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "content-type": metadata.mimeType },
        body: file,
      });
      if (!uploadResponse.ok) {
        setBusy(false);
        setMessage("El bucket rechazo la carga. Revisa las credenciales de storage.");
        return;
      }
    }

    const createResponse = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...metadata, objectKey: presign.objectKey }),
    });

    const created = (await createResponse.json().catch(() => ({}))) as {
      error?: string;
      video?: VideoRecord;
    };

    setBusy(false);

    if (!createResponse.ok || !created.video) {
      setMessage(created.error || "No se pudo guardar la metadata del video.");
      return;
    }

    setVideos((current) => [created.video!, ...current]);
    setSelectedFile(null);
    input.value = "";
    setMessage(
      presign.configured
        ? "Video cargado y listo para cola de análisis."
        : "Metadata guardada. Configura S3/R2/MinIO para subir el archivo real.",
    );
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      setSelectedFile(file);
      setMessage("");
    }
  }

  return (
    <section className="video-workspace">
      <form className="upload-console" onSubmit={submit}>
        <div className="upload-stage">
          <CornerMarks size={14} opacity={0.45} />
          <div className="upload-stage__head">
            <div>
              <span>Entrada de video</span>
              <h2>Arrastra el partido aquí</h2>
            </div>
            <div className={`live-chip ${busy ? "" : "live-chip--muted"}`}>
              <span />
              {busy ? "Procesando" : "Listo"}
            </div>
          </div>

          <button
            className={`drop-zone ${dragOver ? "is-dragging" : ""}`}
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              handleFiles(event.dataTransfer.files);
            }}
          >
            <MicroGrid />
            {selectedFile ? (
              <div className="file-preview">
                <Film size={42} />
                <strong>{selectedFile.name}</strong>
                <span>{formatBytes(selectedFile.size)}</span>
                <div className="fake-controls">
                  <Play size={13} />
                  <SkipForward size={12} />
                  <span>00:00 / 90:00</span>
                </div>
              </div>
            ) : (
              <div className="drop-zone__empty">
                <Upload size={28} />
                <strong>Selecciona o arrastra un video</strong>
                <span>MP4, MOV, AVI o formatos compatibles con tu pipeline.</span>
              </div>
            )}
          </button>

          <input
            ref={inputRef}
            name="video"
            type="file"
            accept="video/*"
            className="visually-hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />

          <div className="upload-actions">
            <button className="button primary command-button" type="submit" disabled={busy}>
              {busy ? <Loader2 className="spin" size={14} /> : <Upload size={14} />}
              {busy ? "Preparando" : "Registrar video"}
            </button>
            {selectedFile ? (
              <button className="button ghost command-button" type="button" onClick={() => setSelectedFile(null)} disabled={busy}>
                <XCircle size={14} />
                Limpiar
              </button>
            ) : null}
          </div>

          {message && <p className="form-note">{message}</p>}
        </div>

        <aside className="upload-side">
          <CornerMarks size={12} opacity={0.32} />
          <div className="score-card">
            <div>
              <span>Local</span>
              <strong>FC Norte</strong>
            </div>
            <div className="score-card__score">
              <b>2</b>
              <span>-</span>
              <b>0</b>
            </div>
            <div>
              <span>Visitante</span>
              <strong>UD Sur</strong>
            </div>
          </div>

          <div className="analysis-steps analysis-steps--vertical">
            {analysisSteps.map((step, index) => (
              <div className="analysis-step" key={step}>
                <span className={busy && index < 2 ? "is-active" : videos.length > 0 && index < 4 ? "is-complete" : ""}>
                  {videos.length > 0 && index < 4 ? <CheckCircle2 size={9} /> : null}
                </span>
                {step}
              </div>
            ))}
          </div>

          <div className="mini-field">
            <Crosshair size={18} opacity={0.2} />
            <span className="field-midline" />
            <span className="field-circle" />
            <span className="ball-marker" style={{ left: "58%", top: "48%" }} />
            <span className="player-marker home" style={{ left: "31%", top: "36%" }} />
            <span className="player-marker away" style={{ left: "72%", top: "61%" }} />
          </div>
        </aside>
      </form>

      <section className="recent-videos lab-panel">
        <div className="panel-heading">
          <div>
            <span>Biblioteca</span>
            <h2>Videos recientes</h2>
          </div>
        </div>

        {videos.length === 0 ? (
          <div className="empty-state">
            <Film size={24} />
            <strong>No hay videos todavía.</strong>
            <span>El primer registro aparecerá aquí con estado pendiente de análisis.</span>
          </div>
        ) : (
          <div className="video-list">
            {videos.map((video) => (
              <article className="video-row" key={video.id}>
                <Film size={17} />
                <div>
                  <strong>{video.originalFilename}</strong>
                  <span>{formatBytes(Number(video.sizeBytes))}</span>
                </div>
                <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "tamaño no disponible";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

