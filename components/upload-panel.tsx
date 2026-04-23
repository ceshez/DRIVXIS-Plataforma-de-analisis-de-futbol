"use client";

import { useState } from "react";

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

export function UploadPanel({ initialVideos }: UploadPanelProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const input = event.currentTarget.elements.namedItem("video") as HTMLInputElement;
    const file = input.files?.[0];
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
    input.value = "";
    setMessage(
      presign.configured
        ? "Video cargado y listo para cola de analisis."
        : "Metadata guardada. Configura S3/R2/MinIO para subir el archivo real.",
    );
  }

  return (
    <section className="video-workspace">
      <div className="upload-panel">
        <p className="eyebrow">Biblioteca de partidos</p>
        <h2>Sube el material ahora, conecta el modelo despues</h2>
        <p>
          La plataforma registra propietario, tamano, tipo de archivo, objeto de storage y estado
          para que el pipeline Python pueda consumir la cola en una siguiente fase.
        </p>

        <form className="upload-form" onSubmit={submit}>
          <input name="video" type="file" accept="video/*" />
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? "Preparando..." : "Registrar video"}
          </button>
        </form>
        {message && <p className="form-note">{message}</p>}
      </div>

      <div className="video-list">
        {videos.length === 0 ? (
          <div className="empty-state">
            <strong>No hay videos todavia.</strong>
            <span>El primer registro aparecera aqui con estado pendiente de analisis.</span>
          </div>
        ) : (
          videos.map((video) => (
            <article className="video-row" key={video.id}>
              <div>
                <strong>{video.originalFilename}</strong>
                <span>{formatBytes(Number(video.sizeBytes))}</span>
              </div>
              <span className={`status-pill ${video.status.toLowerCase()}`}>{formatStatus(video.status)}</span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return "Tamano no disponible";
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
