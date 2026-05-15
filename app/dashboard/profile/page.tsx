import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { ProfileAvatarUploader } from "@/components/profile-avatar-uploader";
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

      <section className="profile-page">
        <header className="profile-page__header">
          <h1>Perfil</h1>
          <p>Administra tu información personal dentro de DRIVXIS.</p>
        </header>

        <ProfileAvatarUploader
          name={user.name}
          email={user.email}
          hasAvatar={Boolean(user.avatarObjectKey)}
          avatarVersion={user.updatedAt.toISOString()}
        />
      </section>
    </main>
  );
}

