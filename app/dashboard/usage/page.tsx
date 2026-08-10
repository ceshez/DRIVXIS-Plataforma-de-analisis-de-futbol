import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { UsageDashboard, type UsagePayload } from "@/components/usage-dashboard";
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

      <UsageDashboard usage={usage} />
    </main>
  );
}
async function getUsage(userId: string): Promise<UsagePayload> {
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
