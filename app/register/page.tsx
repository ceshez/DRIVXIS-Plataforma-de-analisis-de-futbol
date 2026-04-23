import Link from "next/link";
import { AuthForm } from "@/components/auth-forms";
import { Logo } from "@/components/logo";

export default function RegisterPage() {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Logo />
        <section className="auth-panel">
          <p className="eyebrow">Registro público</p>
          <h1>Crea tu base de trabajo en DRIVXIS</h1>
          <p>
            La cuenta guarda tu biblioteca de videos, cola de análisis y resultados futuros de
            forma aislada por usuario.
          </p>
          <AuthForm mode="register" />
          <p className="auth-switch">
            Ya tienes cuenta? <Link href="/login">Entrar</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
