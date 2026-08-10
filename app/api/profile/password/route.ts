import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { requestPasswordChange, resetPasswordWithCode } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { requireUser, setSessionCookie } from "@/lib/session";
import { changePasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos inválidos." }, { status: 400 });
  }

  if (parsed.data.action === "request") {
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    if (!account) return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });
    if (await verifyPassword(parsed.data.newPassword, account.passwordHash)) {
      return NextResponse.json({ error: "La nueva contraseña debe ser diferente a la actual." }, { status: 400 });
    }

    const result = await requestPasswordChange(user.id);
    return NextResponse.json({ ok: true, ...result });
  }

  const changed = await resetPasswordWithCode({
    email: user.email,
    code: parsed.data.code,
    newPassword: parsed.data.newPassword,
  });
  if (!changed) {
    return NextResponse.json({ error: "El código es inválido, venció o alcanzó el máximo de intentos." }, { status: 400 });
  }

  const updated = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, role: true, sessionVersion: true },
  });
  if (!updated) return NextResponse.json({ error: "Cuenta no encontrada." }, { status: 404 });

  await setSessionCookie({
    userId: updated.id,
    email: updated.email,
    role: updated.role,
    sessionVersion: updated.sessionVersion,
  });
  return NextResponse.json({ ok: true });
}
