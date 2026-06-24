import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MANAGER_ROLES = new Set(["OWNER", "ADMIN"]);

export async function getTeamAccess(teamId: string, userId: string) {
  return prisma.teamMember.findFirst({
    where: { teamId, userId },
    select: { role: true, team: { select: { id: true, ownerId: true } } },
  });
}

export function canManageTeam(role: string | undefined) {
  return role ? MANAGER_ROLES.has(role) : false;
}

export function teamAccessError(status = 403) {
  return NextResponse.json({ error: status === 404 ? "Equipo no encontrado." : "No tienes permisos para esta acción." }, { status });
}
