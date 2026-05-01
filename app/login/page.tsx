import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthForm } from "@/components/auth-forms";
import { CornerMarks, MicroGrid } from "@/components/micro-graphics";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <MicroGrid />
      <span className="auth-glow" />
      <section className="auth-panel">
        <CornerMarks size={14} opacity={0.5} />
        <Link className="auth-brand" href="/">
          DRI<span>V</span>XIS
        </Link>
        <div className="auth-panel__copy">
          <span>Acceso al sistema</span>
          <h1>Entra a tu sala de análisis</h1>
          <p>Usa tus credenciales para abrir el laboratorio táctico, revisar videos y preparar reportes.</p>
        </div>
        <AuthForm mode="login" />
        <p className="auth-switch">
          ¿No tienes cuenta? <Link href="/register">Crear cuenta <ArrowRight size={12} /></Link>
        </p>
      </section>
    </main>
  );
}
