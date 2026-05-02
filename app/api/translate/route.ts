import { NextResponse } from "next/server";
import { pickLocale, translateDictionary } from "@/lib/i18n";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    locale?: string;
    dictionary?: Record<string, string>;
  } | null;

  if (!body?.dictionary || typeof body.dictionary !== "object") {
    return NextResponse.json({ error: "Diccionario inválido." }, { status: 400 });
  }

  const locale = pickLocale(body.locale || "es");
  const safeDictionary = Object.fromEntries(
    Object.entries(body.dictionary)
      .filter(([, value]) => typeof value === "string" && value.length <= 600)
      .slice(0, 80),
  );

  return NextResponse.json({ locale, dictionary: await translateDictionary(safeDictionary, locale) });
}
