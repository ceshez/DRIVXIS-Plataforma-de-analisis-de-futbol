import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { createTeamSchema } from "@/lib/validators";

export async function GET() {
  const user = await requireUser();
  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    orderBy: { team: { updatedAt: "desc" } },
    select: {
      role: true,
      team: {
        select: {
          id: true,
          name: true,
          season: true,
          ownerId: true,
          updatedAt: true,
          _count: { select: { players: true, members: true } },
        },
      },
    },
  });
  return NextResponse.json({ teams: memberships.map(({ role, team }) => ({ ...team, role })) });
}

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = createTeamSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos de equipo inválidos." }, { status: 400 });

  const team = await prisma.team.create({
    data: {
      ...parsed.data,
      ownerId: user.id,
      members: { create: { userId: user.id, role: "OWNER" } },
    },
    select: { id: true, name: true, season: true, ownerId: true, createdAt: true },
  });
  return NextResponse.json({ team }, { status: 201 });
}
