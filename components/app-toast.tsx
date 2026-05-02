"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

export type AppToast = {
  id: string;
  message: string;
  tone?: "success" | "info" | "warning";
  durationMs: number;
};

type PushToastOptions = {
  tone?: AppToast["tone"];
  durationMs?: number;
  dedupeKey?: string;
  sound?: boolean;
};

export function useAppToasts() {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, options: PushToastOptions = {}) => {
    if (options.dedupeKey && typeof window !== "undefined") {
      const storageKey = `drivxis:toast:${options.dedupeKey}`;
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    }

    if (options.sound) {
      playConfirmationSound();
    }

    const id = createToastId();
    const toast: AppToast = {
      id,
      message,
      tone: options.tone ?? "success",
      durationMs: options.durationMs ?? 7000,
    };
    setToasts((current) => [...current, toast].slice(-4));
  }, []);

  return { toasts, pushToast, dismissToast };
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: AppToast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="app-toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: AppToast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.durationMs, toast.id]);

  return (
    <div className={`app-toast app-toast--${toast.tone ?? "success"}`}>
      <CheckCircle2 size={16} />
      <span>{toast.message}</span>
      <button type="button" aria-label="Cerrar notificación" onClick={() => onDismiss(toast.id)}>
        <X size={14} />
      </button>
    </div>
  );
}

export function playConfirmationSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(980, context.currentTime + 0.08);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    window.setTimeout(() => void context.close().catch(() => undefined), 260);
  } catch {
    // Browser autoplay policies can block Web Audio; notifications still work.
  }
}

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

