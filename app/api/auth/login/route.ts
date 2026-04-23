import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { loginSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos invalidos." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, email: true, role: true, passwordHash: true },
  });

  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "Correo o contrasena incorrectos." }, { status: 401 });
  }

  await setSessionCookie({ userId: user.id, email: user.email, role: user.role });
  return NextResponse.json({ ok: true });
}
