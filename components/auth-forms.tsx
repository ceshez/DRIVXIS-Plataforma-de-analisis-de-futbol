"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
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

    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setLoading(false);

    if (!response.ok) {
      setError(data.error || "No pudimos completar la solicitud.");
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {mode === "register" && (
        <label>
          <span>Nombre</span>
          <input name="name" autoComplete="name" placeholder="Carlos Sanchez" required minLength={2} />
        </label>
      )}

      <label>
        <span>Correo electronico</span>
        <input name="email" type="email" autoComplete="email" placeholder="analista@club.com" required />
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

      {error && <p className="form-error">{error}</p>}

      <button className="button primary wide command-button" type="submit" disabled={loading}>
        {loading ? <Loader2 className="spin" size={14} /> : null}
        {loading ? "Procesando" : mode === "register" ? "Crear cuenta" : "Entrar al sistema"}
      </button>
    </form>
  );
}
