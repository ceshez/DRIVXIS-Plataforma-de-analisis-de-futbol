import { NextResponse } from "next/server";
import { getTeamAccess, canManageTeam, teamAccessError } from "@/lib/team-access";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createTeamInvitationSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const [user, { id: teamId }] = await Promise.all([requireUser(), context.params]);
  const access = await getTeamAccess(teamId, user.id);
  if (!access) return teamAccessError(404);
  if (!canManageTeam(access.role)) return teamAccessError();

  const parsed = createTeamInvitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invitación inválida." }, { status: 400 });

  const invitation = await prisma.teamInvitation.upsert({
    where: { teamId_email: { teamId, email: parsed.data.email } },
    create: { ...parsed.data, teamId, invitedById: user.id, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    update: { role: parsed.data.role, invitedById: user.id, createdAt: new Date(), expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  return NextResponse.json({ invitation }, { status: 201 });
}
