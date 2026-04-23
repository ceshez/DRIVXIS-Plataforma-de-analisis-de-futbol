"use client";

import { useState } from "react";

type Mode = "login" | "register";

type AuthFormProps = {
  mode: Mode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
          Nombre
          <input name="name" autoComplete="name" placeholder="Carlos Sanchez" required minLength={2} />
        </label>
      )}

      <label>
        Correo electronico
        <input name="email" type="email" autoComplete="email" placeholder="usuario@equipo.com" required />
      </label>

      <label>
        Contrasena
        <input
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          placeholder="********"
          required
          minLength={mode === "register" ? 8 : 1}
        />
      </label>

      {error && <p className="form-error">{error}</p>}

      <button className="button primary wide" type="submit" disabled={loading}>
        {loading ? "Procesando..." : mode === "register" ? "Crear cuenta" : "Entrar al sistema"}
      </button>
    </form>
  );
}
