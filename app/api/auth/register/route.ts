import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/password";
import { setPreferenceCookies } from "@/lib/preference-cookies";
import { prisma } from "@/lib/prisma";
import { getServerPreferences } from "@/lib/server-preferences";
import { setSessionCookie } from "@/lib/session";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos inválidos." }, { status: 400 });
  }

  try {
    const preferences = await getServerPreferences();
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash: await hashPassword(parsed.data.password),
        locale: preferences.locale,
        theme: preferences.theme,
      },
      select: { id: true, email: true, role: true, locale: true, theme: true, sessionVersion: true },
    });

    await Promise.all([
      setSessionCookie({
        userId: user.id,
        email: user.email,
        role: user.role,
        sessionVersion: user.sessionVersion,
      }),
      setPreferenceCookies({ locale: preferences.locale, theme: preferences.theme }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P1000") {
      return NextResponse.json(
        { error: "La conexion con la base de datos fue rechazada. Revisa DATABASE_URL y las credenciales." },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: "No pudimos crear la cuenta." }, { status: 500 });
  }
}
