import Link from "next/link";
import { AuthForm } from "@/components/auth-forms";
import { Logo } from "@/components/logo";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Logo />
        <section className="auth-panel">
          <p className="eyebrow">Acceso al sistema</p>
          <h1>Entra a tu sala de analisis</h1>
          <p>
            Inicia sesión para acceder al módulo de análisis. Sin instalaciones, sin hardware
            adicional.
          </p>
          <AuthForm mode="login" />
          <p className="auth-switch">
            No tienes cuenta? <Link href="/register">Crear cuenta</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
