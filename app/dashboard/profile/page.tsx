import { DashboardHeader } from "@/components/dashboard-header";
import { AnnotationLine, MicroGrid } from "@/components/micro-graphics";
import { ProfileAvatarUploader } from "@/components/profile-avatar-uploader";
import { UserProfileMenu } from "@/components/user-profile-menu";
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
          <AnnotationLine label="perfil" value="CUENTA / CONFIGURACION" />
          <h1>Perfil</h1>
          <p>Seccion base para editar datos personales en una siguiente fase.</p>
        </div>
      </section>

      <section className="history-stat-grid">
        <article className="stat-cell history-stat">
          <span>Datos personales</span>
          <strong>
            {user.name}
            <small>usuario</small>
          </strong>
          <span className="history-muted">{user.email}</span>
        </article>

        <article className="stat-cell history-stat">
          <span>Imagen de perfil</span>
          <strong>
            Activa
            <small>avatar</small>
          </strong>
          <span className="history-muted">Sube una imagen para personalizar tu avatar del dashboard.</span>
        </article>

        <article className="stat-cell history-stat">
          <span>Preferencias</span>
          <strong>
            Proximamente
            <small>fase 2</small>
          </strong>
          <span className="history-muted">Aqui se configuraran idioma, notificaciones y defaults.</span>
        </article>
      </section>

      <ProfileAvatarUploader
        name={user.name}
        email={user.email}
        hasAvatar={Boolean(user.avatarObjectKey)}
        avatarVersion={user.updatedAt.toISOString()}
      />
    </main>
  );
}

