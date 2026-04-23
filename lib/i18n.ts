import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export type Dictionary = Record<string, string>;

export function pickLocale(acceptLanguage: string | null | undefined) {
  if (!acceptLanguage) return "es";

  const preferred = acceptLanguage
    .split(",")
    .map((entry) => entry.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean);

  return preferred[0]?.split("-")[0] || "es";
}

export async function getRequestLocale() {
  const headerStore = await headers();
  return pickLocale(headerStore.get("accept-language"));
}

function sourceHash(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

async function translateText(text: string, locale: string) {
  if (locale === "es" || !process.env.GOOGLE_TRANSLATE_API_KEY) return text;

  const hash = sourceHash(text);

  try {
    const cached = await prisma.translationCache.findUnique({
      where: { locale_sourceHash: { locale, sourceHash: hash } },
    });
    if (cached) return cached.translatedText;
  } catch {
    return text;
  }

  try {
    const response = await fetch(
      `https://translation.googleapis.com/language/translate/v2?key=${process.env.GOOGLE_TRANSLATE_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: "es",
          target: locale,
          format: "text",
        }),
      },
    );

    if (!response.ok) return text;
    const data = (await response.json()) as {
      data?: { translations?: Array<{ translatedText?: string }> };
    };
    const translated = data.data?.translations?.[0]?.translatedText ?? text;

    await prisma.translationCache.upsert({
      where: { locale_sourceHash: { locale, sourceHash: hash } },
      update: { translatedText: translated },
      create: { locale, sourceHash: hash, sourceText: text, translatedText: translated },
    });

    return translated;
  } catch {
    return text;
  }
}

export async function translateDictionary(dictionary: Dictionary, locale: string) {
  if (locale === "es") return dictionary;

  const translatedEntries = await Promise.all(
    Object.entries(dictionary).map(async ([key, value]) => [key, await translateText(value, locale)]),
  );

  return Object.fromEntries(translatedEntries) as Dictionary;
}
