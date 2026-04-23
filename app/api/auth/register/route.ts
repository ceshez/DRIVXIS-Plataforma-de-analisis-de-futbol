import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/session";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos invalidos." }, { status: 400 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
      },
      select: { id: true, email: true, role: true },
    });

    await setSessionCookie({ userId: user.id, email: user.email, role: user.role });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo." }, { status: 409 });
    }

    return NextResponse.json({ error: "No pudimos crear la cuenta." }, { status: 500 });
  }
}
