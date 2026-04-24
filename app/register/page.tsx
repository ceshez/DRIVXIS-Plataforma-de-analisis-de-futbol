import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthForm } from "@/components/auth-forms";
import { CornerMarks, MicroGrid } from "@/components/micro-graphics";

type RegisterPageProps = {
  searchParams?: Promise<{ email?: string }>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = (await searchParams) ?? {};

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
          <span>Registro publico</span>
          <h1>Crea tu base de trabajo</h1>
          <p>La cuenta guarda tu biblioteca de videos, cola de analisis y resultados futuros por usuario.</p>
        </div>
        <AuthForm mode="register" initialEmail={params.email || ""} />
        <p className="auth-switch">
          Ya tienes cuenta? <Link href="/login">Entrar <ArrowRight size={12} /></Link>
        </p>
      </section>
    </main>
  );
}
