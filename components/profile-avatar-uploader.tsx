"use client";

import { useEffect, useMemo, useState } from "react";

type ProfileAvatarUploaderProps = {
  name: string;
  email: string;
  hasAvatar: boolean;
  avatarVersion: string;
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProfileAvatarUploader({ name, email, hasAvatar, avatarVersion }: ProfileAvatarUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(avatarVersion || "0");
  const [hasServerAvatar, setHasServerAvatar] = useState(hasAvatar);
  const initials = useMemo(() => (name.trim() || email.trim() || "U").charAt(0).toUpperCase(), [email, name]);

  const currentAvatarUrl = useMemo(
    () => (hasServerAvatar ? `/api/profile/avatar?v=${encodeURIComponent(nonce)}` : ""),
    [hasServerAvatar, nonce],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onSelectFile(file: File | null) {
    setMessage("");
    setError("");
    setSelectedFile(file);
    if (!file) {
      setPreviewUrl("");
      return;
    }
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  }

  async function uploadAvatar() {
    if (!selectedFile) {
      setError("Selecciona una imagen antes de subir.");
      return;
    }
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      setError("Formato no permitido. Usa JPG, PNG o WEBP.");
      return;
    }
    if (!selectedFile.size || selectedFile.size > MAX_AVATAR_BYTES) {
      setError("La imagen supera el límite de 2MB.");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    const payload = new FormData();
    payload.set("file", selectedFile);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: payload,
      });
      const data = (await response.json().catch(() => ({}))) as {
        avatar?: { updatedAt?: string };
        error?: string;
      };

      if (!response.ok) {
        setError(data.error || "No se pudo subir la imagen.");
        setLoading(false);
        return;
      }

      const updatedAt = data.avatar?.updatedAt || String(Date.now());
      setNonce(updatedAt);
      setHasServerAvatar(true);
      setSelectedFile(null);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return "";
      });
      setMessage("Imagen de perfil actualizada.");
      window.dispatchEvent(new CustomEvent("drivxis:avatar-updated", { detail: { updatedAt } }));
    } catch {
      setError("No se pudo subir la imagen. Revisa tu conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="profile-avatar-card lab-panel">
      <div className="profile-avatar-card__preview">
        {previewUrl ? (
          <img src={previewUrl} alt="Vista previa del avatar" />
        ) : currentAvatarUrl ? (
          <img src={currentAvatarUrl} alt="Avatar actual" />
        ) : (
          <span>{initials}</span>
        )}
      </div>

      <div className="profile-avatar-card__copy">
        <strong>Imagen de perfil</strong>
        <p>Formatos permitidos: JPG, PNG, WEBP. Tamaño máximo: 2MB.</p>
      </div>

      <label className="button ghost profile-avatar-card__input">
        Seleccionar imagen
        <input
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
          disabled={loading}
        />
      </label>

      <button className="button primary" type="button" onClick={() => void uploadAvatar()} disabled={loading || !selectedFile}>
        {loading ? "Subiendo..." : "Guardar avatar"}
      </button>

      {message ? <p className="profile-avatar-card__message profile-avatar-card__message--success">{message}</p> : null}
      {error ? <p className="profile-avatar-card__message profile-avatar-card__message--error">{error}</p> : null}
    </section>
  );
}
