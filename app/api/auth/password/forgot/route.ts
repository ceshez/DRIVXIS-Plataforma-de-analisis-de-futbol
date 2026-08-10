import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/password-reset";
import { forgotPasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Correo invalido." }, { status: 400 });
  }

  const result = await requestPasswordReset(parsed.data.email);
  return NextResponse.json({
    ok: true,
    message: "Si existe una cuenta con ese correo, enviamos un codigo para cambiar la contraseña.",
    ...result,
  }, { status: 202 });
}
