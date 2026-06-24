"use client";

import { useEffect, useMemo, useReducer } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";

type ProfileAvatarUploaderProps = {
  name: string;
  email: string;
  hasAvatar: boolean;
  avatarVersion: string;
};

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type AvatarUploadState = {
  selectedFile: File | null;
  previewUrl: string;
  loading: boolean;
  message: string;
  error: string;
  localAvatarVersion: string | null;
  hasLocalAvatar: boolean;
};

type AvatarUploadAction =
  | { type: "fileSelected"; file: File | null; previewUrl: string }
  | { type: "uploadStarted" }
  | { type: "uploadFailed"; message: string }
  | { type: "uploadSucceeded"; updatedAt: string }
  | { type: "uploadFinished" };

const INITIAL_AVATAR_UPLOAD_STATE: AvatarUploadState = {
  selectedFile: null,
  previewUrl: "",
  loading: false,
  message: "",
  error: "",
  localAvatarVersion: null,
  hasLocalAvatar: false,
};

function avatarUploadReducer(state: AvatarUploadState, action: AvatarUploadAction): AvatarUploadState {
  switch (action.type) {
    case "fileSelected":
      return {
        ...state,
        selectedFile: action.file,
        previewUrl: action.previewUrl,
        message: "",
        error: "",
      };
    case "uploadStarted":
      return { ...state, loading: true, message: "", error: "" };
    case "uploadFailed":
      return { ...state, error: action.message };
    case "uploadSucceeded":
      return {
        ...state,
        selectedFile: null,
        previewUrl: "",
        message: "Imagen de perfil actualizada.",
        error: "",
        localAvatarVersion: action.updatedAt,
        hasLocalAvatar: true,
      };
    case "uploadFinished":
      return { ...state, loading: false };
  }
}

export function ProfileAvatarUploader({ name, email, hasAvatar, avatarVersion }: ProfileAvatarUploaderProps) {
  const [uploadState, dispatchUpload] = useReducer(avatarUploadReducer, INITIAL_AVATAR_UPLOAD_STATE);
  const { selectedFile, previewUrl, loading, message, error, localAvatarVersion, hasLocalAvatar } = uploadState;
  const initials = useMemo(() => (name.trim() || email.trim() || "U").charAt(0).toUpperCase(), [email, name]);
  const fileInputId = "profile-avatar-input";
  const avatarNonce = localAvatarVersion ?? avatarVersion ?? "0";
  const hasCurrentAvatar = hasAvatar || hasLocalAvatar;
  const currentAvatarUrl = hasCurrentAvatar ? `/api/profile/avatar?v=${encodeURIComponent(avatarNonce)}` : "";

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function onSelectFile(file: File | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    dispatchUpload({
      type: "fileSelected",
      file,
      previewUrl: file ? URL.createObjectURL(file) : "",
    });
  }

  async function uploadAvatar() {
    if (!selectedFile) {
      dispatchUpload({ type: "uploadFailed", message: "Selecciona una imagen antes de subir." });
      return;
    }
    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      dispatchUpload({ type: "uploadFailed", message: "Formato no permitido. Usa JPG, PNG o WEBP." });
      return;
    }
    if (!selectedFile.size || selectedFile.size > MAX_AVATAR_BYTES) {
      dispatchUpload({ type: "uploadFailed", message: "La imagen supera el limite de 2MB." });
      return;
    }

    dispatchUpload({ type: "uploadStarted" });

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
        dispatchUpload({ type: "uploadFailed", message: data.error || "No se pudo subir la imagen." });
        return;
      }

      const updatedAt = data.avatar?.updatedAt || String(Date.now());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      dispatchUpload({ type: "uploadSucceeded", updatedAt });
      window.dispatchEvent(new CustomEvent("drivxis:avatar-updated", { detail: { updatedAt } }));
    } catch {
      dispatchUpload({ type: "uploadFailed", message: "No se pudo subir la imagen. Revisa tu conexion." });
    } finally {
      dispatchUpload({ type: "uploadFinished" });
    }
  }

  return (
    <section className="profile-editor lab-panel" aria-busy={loading}>
      <div className="profile-editor__avatar-wrap">
        <label className="profile-editor__avatar-button" htmlFor={fileInputId} aria-label="Actualizar foto de perfil">
          {previewUrl ? (
            <Image src={previewUrl} alt="Vista previa del avatar" width={172} height={172} unoptimized />
          ) : currentAvatarUrl ? (
            <Image src={currentAvatarUrl} alt="Avatar actual" width={172} height={172} unoptimized />
          ) : (
            <span>{initials}</span>
          )}
          <span className="profile-editor__avatar-overlay">
            <i aria-hidden="true">+</i>
            <b>Actualizar foto de perfil</b>
          </span>
        </label>
        <p className="profile-editor__avatar-help">JPG, PNG o WEBP hasta 2MB.</p>
      </div>

      <label className="profile-editor__input-shell" htmlFor={fileInputId}>
        Seleccionar imagen
        <input
          id={fileInputId}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          onChange={(event) => onSelectFile(event.target.files?.[0] || null)}
          disabled={loading}
        />
      </label>

      <div className="profile-editor__fields">
        <label>
          <span>Nombre</span>
          <input type="text" value={name} readOnly />
        </label>
        <label>
          <span>Correo</span>
          <input type="email" value={email} readOnly />
        </label>
      </div>

      <button className="button primary profile-editor__save" type="button" onClick={() => void uploadAvatar()} disabled={loading || !selectedFile}>
        {loading ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
        {loading ? "Subiendo avatar..." : "Guardar avatar"}
      </button>

      <p className="profile-editor__note">Mas opciones de perfil estaran disponibles proximamente.</p>
      {loading ? <p className="visually-hidden" role="status">Subiendo avatar. Espera un momento.</p> : null}
      {message ? <p className="profile-editor__message profile-editor__message--success">{message}</p> : null}
      {error ? <p className="profile-editor__message profile-editor__message--error">{error}</p> : null}
    </section>
  );
}
