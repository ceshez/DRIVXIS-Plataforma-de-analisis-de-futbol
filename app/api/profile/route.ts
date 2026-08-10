import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser, setSessionCookie } from "@/lib/session";
import { updateProfileSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos de perfil invalidos." }, { status: 400 });
  }

  const emailChanged = parsed.data.email !== user.email;

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        ...(emailChanged ? { sessionVersion: { increment: 1 } } : {}),
      },
      select: { id: true, name: true, email: true, role: true, sessionVersion: true, updatedAt: true },
    });
    await setSessionCookie({
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      sessionVersion: updated.sessionVersion,
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ese correo ya esta asociado a otra cuenta." }, { status: 409 });
    }
    return NextResponse.json({ error: "No pudimos actualizar el perfil." }, { status: 500 });
  }
}
