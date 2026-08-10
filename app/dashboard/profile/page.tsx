import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { ProfileSettings } from "@/components/profile-settings";
import { requireUser } from "@/lib/session";

export default async function ProfilePage() {
  const user = await requireUser();

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

      <ProfileSettings
        name={user.name}
        email={user.email}
        hasAvatar={Boolean(user.avatarObjectKey)}
        avatarVersion={user.updatedAt.toISOString()}
      />
    </main>
  );
}

