"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { CornerMarks, MicroGrid } from "@/components/micro-graphics";

type Notice = { tone: "success" | "error"; title: string; message: string };

export function ForgotPasswordPageContent({ initialEmail = "" }: { initialEmail?: string }) {
  const { t } = useAppPreferences();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [resetHref, setResetHref] = useState("/reset-password");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);
    const email = String(new FormData(event.currentTarget).get("email") || "");
    const response = await fetch("/api/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { error?: string; developmentCode?: string } | undefined;
    setLoading(false);

    if (!response?.ok) {
      setNotice({ tone: "error", title: "No pudimos enviar el código", message: data?.error || "Revisa el correo e intenta de nuevo." });
      return;
    }

    const params = new URLSearchParams({ email });
    if (data?.developmentCode) params.set("code", data.developmentCode);
    setResetHref(`/reset-password?${params.toString()}`);
    setNotice({
      tone: "success",
      title: t("codeSentTitle"),
      message: data?.developmentCode
        ? `${t("codeSentMessage")} Código local: ${data.developmentCode}`
        : t("codeSentMessage"),
    });
  }

  return (
    <RecoveryShell eyebrow={t("forgotEyebrow")} title={t("forgotTitle")} description={t("forgotDescription")}>
      <form className="auth-form" onSubmit={submit} aria-busy={loading}>
        <label>
          <span>{t("email")}</span>
          <input name="email" type="email" autoComplete="email" defaultValue={initialEmail} required />
        </label>
        <button className="button primary wide command-button" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={14} /> : null}
          {loading ? t("sendingCode") : t("sendCode")}
        </button>
      </form>
      {notice?.tone === "success" ? <Link className="button ghost wide" href={resetHref}>{t("changePassword")}</Link> : null}
      <RecoveryNotice notice={notice} />
      <Link className="auth-return-link" href="/login">{t("backToLogin")}</Link>
    </RecoveryShell>
  );
}

export function ResetPasswordPageContent({ initialEmail = "", initialCode = "" }: { initialEmail?: string; initialCode?: string }) {
  const { t } = useAppPreferences();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [completed, setCompleted] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") || "");
    if (newPassword !== String(form.get("confirmPassword") || "")) {
      setNotice({ tone: "error", title: "Las contraseñas no coinciden", message: "Escribe la misma contraseña en ambos campos." });
      return;
    }

    setLoading(true);
    const response = await fetch("/api/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: String(form.get("email") || ""),
        code: String(form.get("code") || ""),
        newPassword,
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => ({}))) as { error?: string } | undefined;
    setLoading(false);

    if (!response?.ok) {
      setNotice({ tone: "error", title: "No se pudo cambiar la contraseña", message: data?.error || "Revisa el código e intenta de nuevo." });
      return;
    }
    setCompleted(true);
    setNotice({ tone: "success", title: "Contraseña actualizada", message: "Ya puedes iniciar sesión con tu nueva contraseña." });
  }

  return (
    <RecoveryShell eyebrow={t("resetEyebrow")} title={t("resetTitle")} description={t("resetDescription")}>
      {!completed ? (
        <form className="auth-form" onSubmit={submit} aria-busy={loading}>
          <label><span>{t("email")}</span><input name="email" type="email" autoComplete="email" defaultValue={initialEmail} required /></label>
          <label><span>{t("verificationCode")}</span><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} defaultValue={initialCode} required /></label>
          <PasswordInput name="newPassword" label={t("newPassword")} show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          <PasswordInput name="confirmPassword" label={t("confirmPassword")} show={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          <button className="button primary wide command-button" type="submit" disabled={loading}>
            {loading ? <Loader2 className="spin" size={14} /> : null}
            {loading ? t("changingPassword") : t("changePassword")}
          </button>
        </form>
      ) : <Link className="button primary wide" href="/login">{t("enter")}</Link>}
      <RecoveryNotice notice={notice} />
      {!completed ? <Link className="auth-return-link" href="/forgot-password">{t("sendCode")}</Link> : null}
    </RecoveryShell>
  );
}

function PasswordInput({ name, label, show, onToggle }: { name: string; label: string; show: boolean; onToggle: () => void }) {
  const { t } = useAppPreferences();
  return (
    <div className="auth-form__field">
      <label htmlFor={name}>{label}</label>
      <div className="password-field">
        <input id={name} name={name} type={show ? "text" : "password"} autoComplete="new-password" minLength={8} required />
        <button type="button" aria-label={show ? t("hidePassword") : t("showPassword")} onClick={onToggle}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}

function RecoveryShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <MicroGrid />
      <span className="auth-glow" />
      <section className="auth-panel">
        <CornerMarks size={14} opacity={0.5} />
        <Link className="auth-brand" href="/">DRI<span>V</span>XIS</Link>
        <div className="auth-panel__copy"><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        {children}
      </section>
    </main>
  );
}

function RecoveryNotice({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <output className={`auth-inline-notice auth-inline-notice--${notice.tone}`} aria-live="polite">
      {notice.tone === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      <span><strong>{notice.title}</strong><span>{notice.message}</span></span>
    </output>
  );
}
