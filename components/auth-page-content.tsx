"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthForm } from "@/components/auth-forms";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { CornerMarks, MicroGrid } from "@/components/micro-graphics";

export function AuthPageContent({ mode, initialEmail = "" }: { mode: "login" | "register"; initialEmail?: string }) {
  const { t } = useAppPreferences();
  const login = mode === "login";

  return (
    <main className="auth-page">
      <MicroGrid />
      <span className="auth-glow" />
      <section className="auth-panel">
        <CornerMarks size={14} opacity={0.5} />
        <Link className="auth-brand" href="/">DRI<span>V</span>XIS</Link>
        <div className="auth-panel__copy">
          <span>{t(login ? "loginEyebrow" : "registerEyebrow")}</span>
          <h1>{t(login ? "loginTitle" : "registerTitle")}</h1>
          <p>{t(login ? "loginDescription" : "registerDescription")}</p>
        </div>
        <AuthForm mode={mode} initialEmail={initialEmail} />
        <p className="auth-switch">
          {t(login ? "noAccount" : "alreadyAccount")}{" "}
          <Link href={login ? "/register" : "/login"}>
            {t(login ? "createAccount" : "enter")} <ArrowRight size={12} />
          </Link>
        </p>
      </section>
    </main>
  );
}
