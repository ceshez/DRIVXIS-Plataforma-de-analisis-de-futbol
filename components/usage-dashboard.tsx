"use client";

import type { ReactNode } from "react";
import { Activity, Bot, Clock3, Gauge, HardDrive, TriangleAlert, Video } from "lucide-react";
import { useAppPreferences } from "@/components/app-preferences-provider";

export type UsagePayload = {
  storage: {
    usedBytes: string;
    limitBytes: string;
    remainingBytes: string;
    percentUsed: number;
  };
  videos: {
    total: number;
    analyzed: number;
    processing: number;
    failed: number;
  };
};

export function UsageDashboard({ usage }: { usage: UsagePayload }) {
  const { locale } = useAppPreferences();
  const english = locale === "en";

  return (
    <section className="usage-page">
      <header className="usage-page__header">
        <div className="usage-page__title"><Gauge size={14} /><h1>{english ? "Usage" : "Uso"}</h1></div>
        <p>{english ? "Monitor your account consumption within DRIVXIS." : "Monitorea el consumo de tu cuenta dentro de DRIVXIS."}</p>
      </header>

      <section className={`usage-storage ${getStorageToneClass(usage.storage.percentUsed)}`}>
        <div className="usage-storage__top">
          <div>
            <span>{english ? "Storage" : "Almacenamiento"}</span>
            <h2>
              {formatBytes(usage.storage.usedBytes)} {english ? "used of" : "usados de"} {formatBytes(usage.storage.limitBytes)}
            </h2>
          </div>
          <HardDrive size={16} />
        </div>

        <span className="usage-storage__progress" aria-label={`${english ? "Usage" : "Uso"} ${Math.round(usage.storage.percentUsed)}%`}>
          <span style={{ width: `${Math.max(0, Math.min(100, usage.storage.percentUsed))}%` }} />
        </span>

        <div className="usage-storage__meta" aria-label={english ? "Storage details" : "Detalle de almacenamiento"}>
          <article><small>{english ? "Used" : "Usado"}</small><strong>{formatBytes(usage.storage.usedBytes)}</strong></article>
          <article><small>{english ? "Available" : "Disponible"}</small><strong>{formatBytes(usage.storage.remainingBytes)}</strong></article>
          <article><small>{english ? "Limit" : "Límite"}</small><strong>{formatBytes(usage.storage.limitBytes)}</strong></article>
        </div>

        {usage.storage.percentUsed >= 100 ? <p className="usage-storage__warning">{english ? "You have reached your storage limit." : "Has alcanzado tu límite de almacenamiento."}</p> : null}
        {usage.storage.percentUsed >= 90 && usage.storage.percentUsed < 100 ? (
          <p className="usage-storage__warning">{english ? "You are close to your storage limit." : "Estás cerca de tu límite de almacenamiento."}</p>
        ) : null}
      </section>

      <section className="usage-videos">
        <div className="usage-videos__heading"><h2>{english ? "Videos" : "Videos"}</h2></div>
        <div className="usage-videos__grid">
          <MetricCard icon={<Video size={15} />} label={english ? "Uploaded videos" : "Videos subidos"} value={usage.videos.total} />
          <MetricCard icon={<Activity size={15} />} label={english ? "Analyzed" : "Analizados"} value={usage.videos.analyzed} />
          <MetricCard icon={<Clock3 size={15} />} label={english ? "In progress" : "En proceso"} value={usage.videos.processing} />
          <MetricCard icon={<TriangleAlert size={15} />} label={english ? "Failed" : "Fallidos"} value={usage.videos.failed} />
        </div>
      </section>

      <section className="usage-bot">
        <div className="usage-bot__title"><Bot size={15} /><h2>{english ? "Bot tokens" : "Tokens del bot"}</h2><span>{english ? "Coming soon" : "Próximamente"}</span></div>
        <p>{english ? "Here you will be able to monitor intelligent assistance usage within DRIVXIS." : "Aquí podrás ver el consumo de asistencia inteligente dentro de DRIVXIS."}</p>
      </section>
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return <article className="usage-metric"><div className="usage-metric__top"><span>{icon}</span><small>{label}</small></div><strong>{value}</strong></article>;
}

function getStorageToneClass(percentUsed: number) {
  if (percentUsed >= 100) return "is-danger";
  if (percentUsed >= 90) return "is-warning";
  return "is-normal";
}

function formatBytes(value: string) {
  let bytes = 0;
  try { bytes = Number(BigInt(value)); } catch { bytes = 0; }
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
