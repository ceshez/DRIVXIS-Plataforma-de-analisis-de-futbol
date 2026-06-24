import { DashboardHeader } from "@/components/dashboard-header";
import { DashboardHeaderUserAction } from "@/components/dashboard-header-user-action";
import { TeamWorkspace } from "@/components/team-workspace";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export default async function TeamsPage() {
  const user = await requireUser();
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id }, orderBy: { team: { updatedAt: "desc" } },
    select: { role: true, team: { select: { id: true, name: true, season: true, players: { orderBy: { name: "asc" }, select: { id: true, name: true, position: true, shirtNumber: true, status: true } }, invitations: { orderBy: { createdAt: "desc" }, select: { id: true, email: true, role: true, expiresAt: true } }, _count: { select: { members: true } } } } },
  });
  const teams = memberships.map(({ role, team }) => ({ ...team, role, invitations: team.invitations.map((invite) => ({ ...invite, expiresAt: invite.expiresAt.toISOString() })) }));
  return <main className="app-frame dashboard-frame"><DashboardHeader navItems={[{ href: "/dashboard", label: "Panel", exact: true }, { href: "/dashboard/videos", label: "Historial" }, { href: "/dashboard/teams", label: "Equipos" }]} action={<DashboardHeaderUserAction name={user.name} email={user.email} hasAvatar={Boolean(user.avatarObjectKey)} avatarVersion={user.updatedAt.toISOString()} />} /><TeamWorkspace initialTeams={teams} /></main>;
}
