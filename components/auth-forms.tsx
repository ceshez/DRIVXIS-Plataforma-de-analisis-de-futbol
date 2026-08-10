"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
  initialEmail?: string;
};

export function AuthForm({ mode, initialEmail = "" }: AuthFormProps) {
  const { t } = useAppPreferences();
  const [notice, setNotice] = useState<{ tone: "success" | "error"; title: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "register"
        ? {
            name: String(form.get("name") || ""),
            email: String(form.get("email") || ""),
            password: String(form.get("password") || ""),
          }
        : {
            email: String(form.get("email") || ""),
            password: String(form.get("password") || ""),
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string; needsRegistration?: boolean };
        if (mode === "register" && response.status === 409) {
          const email = encodeURIComponent(String(form.get("email") || ""));
          setNotice({ tone: "error", title: "Cuenta existente", message: "Te llevamos al login con tu correo listo." });
          window.setTimeout(() => { window.location.href = `/login${email ? `?email=${email}` : ""}`; }, 1200);
          return;
        }
        if (mode === "login" && data.needsRegistration) {
          const email = encodeURIComponent(String(form.get("email") || ""));
          setNotice({ tone: "error", title: "Cuenta no encontrada", message: "Te llevamos al registro para crear tu acceso." });
          window.setTimeout(() => { window.location.href = `/register${email ? `?email=${email}` : ""}`; }, 1200);
          return;
        }
        setNotice({ tone: "error", title: "Solicitud detenida", message: data.error || "No pudimos completar la solicitud." });
        return;
      }

      setNotice({
        tone: "success",
        title: mode === "register" ? "Cuenta creada" : "Acceso validado",
        message: mode === "register" ? "Tu sala de análisis está lista." : "Entrando al laboratorio táctico.",
      });
      window.setTimeout(() => { window.location.href = "/dashboard"; }, 900);
    } catch {
      setNotice({ tone: "error", title: "Sin conexión", message: "No pudimos contactar el servidor. Intenta de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="auth-form" onSubmit={submit} aria-busy={loading}>
        {mode === "register" && (
          <label>
            <span>{t("name")}</span>
            <input name="name" autoComplete="name" placeholder="Carlos Sánchez" required minLength={2} />
          </label>
        )}

        <label>
          <span>{t("email")}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="analista@club.com"
            defaultValue={initialEmail}
            required
          />
        </label>

        <div className="auth-form__field">
          <label htmlFor={`${mode}-password`}>{t("password")}</label>
          <div className="password-field">
            <input
              id={`${mode}-password`}
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              placeholder="********"
              required
              minLength={mode === "register" ? 8 : 1}
            />
            <button
              type="button"
              aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              onClick={() => setShowPassword((current) => !current)}
              disabled={loading}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {mode === "login" ? (
          <Link className="auth-form__forgot" href={`/forgot-password${initialEmail ? `?email=${encodeURIComponent(initialEmail)}` : ""}`}>
            {t("forgotPassword")}
          </Link>
        ) : null}

        <button className="button primary wide command-button" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={14} /> : null}
          {loading ? t("processing") : mode === "register" ? t("createAccount") : t("enterSystem")}
        </button>
        {loading ? <span className="visually-hidden" role="status">Validando datos. Espera un momento.</span> : null}
      </form>

      {notice ? (
        <output className={`auth-toast auth-toast--${notice.tone}`} aria-live="polite">
          {notice.tone === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <span className="auth-toast__copy">
            <strong>{notice.title}</strong>
            <span>{notice.message}</span>
          </span>
        </output>
      ) : null}
    </>
  );
}


