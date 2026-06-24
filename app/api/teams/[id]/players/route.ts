import { NextResponse } from "next/server";
import { getTeamAccess, canManageTeam, teamAccessError } from "@/lib/team-access";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createPlayerSchema } from "@/lib/validators";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const [user, { id: teamId }] = await Promise.all([requireUser(), context.params]);
  const access = await getTeamAccess(teamId, user.id);
  if (!access) return teamAccessError(404);
  if (!canManageTeam(access.role)) return teamAccessError();

  const parsed = createPlayerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos de jugador inválidos." }, { status: 400 });

  try {
    const player = await prisma.player.create({
      data: { ...parsed.data, teamId, birthDate: parsed.data.birthDate ? new Date(parsed.data.birthDate) : undefined },
    });
    return NextResponse.json({ player }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Ese dorsal ya está asignado en este equipo." }, { status: 409 });
  }
}
