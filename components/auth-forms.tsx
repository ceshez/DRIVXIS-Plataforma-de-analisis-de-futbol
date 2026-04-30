"use client";

import { useState } from "react";
import { CheckCircle2, Eye, EyeOff, Loader2, XCircle } from "lucide-react";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
  initialEmail?: string;
};

export function AuthForm({ mode, initialEmail = "" }: AuthFormProps) {
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

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as { error?: string; needsRegistration?: boolean };
    setLoading(false);

    if (!response.ok) {
      if (mode === "login" && data.needsRegistration) {
        const email = encodeURIComponent(String(form.get("email") || ""));
        setNotice({
          tone: "error",
          title: "Cuenta no encontrada",
          message: "Te llevamos al registro para crear tu acceso.",
        });
        window.setTimeout(() => {
          window.location.href = `/register${email ? `?email=${email}` : ""}`;
        }, 1200);
        return;
      }
      setNotice({
        tone: "error",
        title: "Solicitud detenida",
        message: data.error || "No pudimos completar la solicitud.",
      });
      return;
    }

    setNotice({
      tone: "success",
      title: mode === "register" ? "Cuenta creada" : "Acceso validado",
      message: mode === "register" ? "Tu sala de analisis esta lista." : "Entrando al laboratorio tactico.",
    });
    window.setTimeout(() => {
      window.location.href = "/dashboard";
    }, 900);
  }

  return (
    <>
      <form className="auth-form" onSubmit={submit}>
        {mode === "register" && (
          <label>
            <span>Nombre</span>
            <input name="name" autoComplete="name" placeholder="Carlos Sanchez" required minLength={2} />
          </label>
        )}

        <label>
          <span>Correo electronico</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="analista@club.com"
            defaultValue={initialEmail}
            required
          />
        </label>

        <label>
          <span>Contrasena</span>
          <div className="password-field">
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              placeholder="********"
              required
              minLength={mode === "register" ? 8 : 1}
            />
            <button
              type="button"
              aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        <button className="button primary wide command-button" type="submit" disabled={loading}>
          {loading ? <Loader2 className="spin" size={14} /> : null}
          {loading ? "Procesando" : mode === "register" ? "Crear cuenta" : "Entrar al sistema"}
        </button>
      </form>

      {notice ? (
        <div className={`auth-toast auth-toast--${notice.tone}`} role="status" aria-live="polite">
          {notice.tone === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <div>
            <strong>{notice.title}</strong>
            <span>{notice.message}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
