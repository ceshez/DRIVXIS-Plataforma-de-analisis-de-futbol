import { NextResponse } from "next/server";
import { setPreferenceCookies } from "@/lib/preference-cookies";
import { normalizeLocale, normalizeTheme } from "@/lib/preferences";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { updatePreferencesSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  const user = await requireUser();
  const parsed = updatePreferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Preferencias invalidas." }, { status: 400 });
  }

  const preferences = await prisma.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: { locale: true, theme: true },
  });
  const normalized = {
    locale: normalizeLocale(preferences.locale),
    theme: normalizeTheme(preferences.theme),
  };
  await setPreferenceCookies(normalized);
  return NextResponse.json({ preferences: normalized });
}
