import { DashboardHeader } from "@/components/dashboard-header";
import { AnnotationLine, MicroGrid } from "@/components/micro-graphics";
import { UserProfileMenu } from "@/components/user-profile-menu";
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
          <UserProfileMenu
            name={user.name}
            email={user.email}
            hasAvatar={Boolean(user.avatarObjectKey)}
            avatarVersion={user.updatedAt.toISOString()}
          />
        }
      />

      <section className="dashboard-command dashboard-command--compact">
        <MicroGrid />
        <div className="dashboard-command__copy">
          <AnnotationLine label="uso" value="RECURSOS / CUOTAS" />
          <h1>Uso</h1>
          <p>
            Vista preliminar del uso de almacenamiento, videos y tokens del bot.
          </p>
        </div>
      </section>

      <section className="lab-panel storage-diagnostics">
        <div className="panel-heading">
          <div>
            <span>Cuota</span>
            <h2>Uso de almacenamiento</h2>
          </div>
        </div>
        <p className="history-muted">
          Usado: {formatBytes(usage.storage.usedBytes)} / Límite: {formatBytes(usage.storage.limitBytes)} / Disponible: {formatBytes(usage.storage.remainingBytes)}
        </p>
        <span className="analysis-upload__progress" aria-label={`Uso ${Math.round(usage.storage.percentUsed)}%`}>
          <span style={{ width: `${Math.max(0, Math.min(100, usage.storage.percentUsed))}%` }} />
        </span>
        {usage.storage.percentUsed >= 90 ? (
          <p className="storage-hint">Estás cerca de tu límite de almacenamiento.</p>
        ) : null}
      </section>

      <section className="history-stat-grid">
        <article className="stat-cell history-stat">
          <span>Videos subidos</span>
          <strong>
            {usage.videoCount}
            <small>total</small>
          </strong>
          <span className="history-muted">Conteo global de videos registrados.</span>
        </article>

        <article className="stat-cell history-stat">
          <span>Tokens del bot</span>
          <strong>
            --
            <small>próximamente</small>
          </strong>
          <span className="history-muted">Este módulo se habilitará en una fase posterior.</span>
        </article>
      </section>
    </main>
  );
}

async function getUsage(userId: string) {
  const [dbUser, videoCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { storageUsedBytes: true, storageLimitBytes: true },
    }),
    prisma.video.count({ where: { ownerId: userId } }),
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
    videoCount,
  };
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

