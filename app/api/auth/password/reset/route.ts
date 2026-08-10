import { NextResponse } from "next/server";
import { resetPasswordWithCode } from "@/lib/password-reset";
import { clearSessionCookie } from "@/lib/session";
import { resetPasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = resetPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Datos invalidos." }, { status: 400 });
  }

  const reset = await resetPasswordWithCode(parsed.data);
  if (!reset) {
    return NextResponse.json({ error: "El codigo es incorrecto, ya fue usado o vencio." }, { status: 400 });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
