import { Bot, Clock3, Gauge, HardDrive, TriangleAlert, Video, Activity } from "lucide-react";
import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildStorageUsagePayload } from "@/lib/storage-usage";

export default async function UsagePage() {
  const user = await requireUser();
  const usage = await getUsage(user.id);

  return (
    <main className="app-frame dashboard-frame">
      <DashboardHeader
        navItems={[
          { href: "/dashboard", label: "Panel", exact: true },
          { href: "/dashboard/videos", label: "Historial" },
        ]}
        action={
          <DashboardHeaderUserAction
            name={user.name}
            email={user.email}
            hasAvatar={Boolean(user.avatarObjectKey)}
            avatarVersion={user.updatedAt.toISOString()}
          />
        }
      />

      <section className="usage-page">
        <header className="usage-page__header">
          <div className="usage-page__title">
            <Gauge size={14} />
            <h1>Uso</h1>
          </div>
          <p>Monitorea el consumo de tu cuenta dentro de DRIVXIS.</p>
        </header>

        <section className={`usage-storage ${getStorageToneClass(usage.storage.percentUsed)}`}>
          <div className="usage-storage__top">
            <div>
              <span>Almacenamiento</span>
              <h2>
                {formatBytes(usage.storage.usedBytes)} usados de {formatBytes(usage.storage.limitBytes)}
              </h2>
            </div>
            <HardDrive size={16} />
          </div>

          <span className="usage-storage__progress" aria-label={`Uso ${Math.round(usage.storage.percentUsed)}%`}>
            <span style={{ width: `${Math.max(0, Math.min(100, usage.storage.percentUsed))}%` }} />
          </span>

          <div className="usage-storage__meta" aria-label="Detalle de almacenamiento">
            <article>
              <small>Usado</small>
              <strong>{formatBytes(usage.storage.usedBytes)}</strong>
            </article>
            <article>
              <small>Disponible</small>
              <strong>{formatBytes(usage.storage.remainingBytes)}</strong>
            </article>
            <article>
              <small>Limite</small>
              <strong>{formatBytes(usage.storage.limitBytes)}</strong>
            </article>
          </div>

          {usage.storage.percentUsed >= 100 ? <p className="usage-storage__warning">Has alcanzado tu limite de almacenamiento.</p> : null}
          {usage.storage.percentUsed >= 90 && usage.storage.percentUsed < 100 ? (
            <p className="usage-storage__warning">Estas cerca de tu limite de almacenamiento.</p>
          ) : null}
        </section>

        <section className="usage-videos">
          <div className="usage-videos__heading">
            <h2>Videos</h2>
          </div>
          <div className="usage-videos__grid">
            <MetricCard icon={<Video size={15} />} label="Videos subidos" value={usage.videos.total} />
            <MetricCard icon={<Activity size={15} />} label="Analizados" value={usage.videos.analyzed} />
            <MetricCard icon={<Clock3 size={15} />} label="En proceso" value={usage.videos.processing} />
            <MetricCard icon={<TriangleAlert size={15} />} label="Fallidos" value={usage.videos.failed} />
          </div>
        </section>

        <section className="usage-bot">
          <div className="usage-bot__title">
            <Bot size={15} />
            <h2>Tokens del bot</h2>
            <span>Proximamente</span>
          </div>
          <p>Aqui podras ver el consumo de asistencia inteligente dentro de DRIVXIS.</p>
        </section>
      </section>
    </main>
  );
}

async function getUsage(userId: string) {
  const [dbUser, total, analyzed, processingQueued, processingRunning, failed] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { storageUsedBytes: true, storageLimitBytes: true },
    }),
    prisma.video.count({ where: { ownerId: userId } }),
    prisma.video.count({ where: { ownerId: userId, status: "COMPLETED" } }),
    prisma.video.count({ where: { ownerId: userId, status: "PENDING_ANALYSIS" } }),
    prisma.video.count({ where: { ownerId: userId, status: "PROCESSING" } }),
    prisma.video.count({ where: { ownerId: userId, status: "FAILED" } }),
  ]);

  const storage = dbUser
    ? buildStorageUsagePayload(dbUser.storageUsedBytes, dbUser.storageLimitBytes)
    : buildStorageUsagePayload(0n, 1n);

  return {
    storage: {
      usedBytes: storage.usedBytes,
      limitBytes: storage.limitBytes,
      remainingBytes: storage.remainingBytes,
      percentUsed: storage.percentUsed,
    },
    videos: {
      total,
      analyzed,
      processing: processingQueued + processingRunning,
      failed,
    },
  };
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <article className="usage-metric">
      <div className="usage-metric__top">
        <span>{icon}</span>
        <small>{label}</small>
      </div>
      <strong>{value}</strong>
    </article>
  );
}

function getStorageToneClass(percentUsed: number) {
  if (percentUsed >= 100) return "is-danger";
  if (percentUsed >= 90) return "is-warning";
  return "is-normal";
}

function formatBytes(value: string) {
  let bytes = 0;
  try {
    bytes = Number(BigInt(value));
  } catch {
    bytes = 0;
  }
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount.toFixed(amount >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}
