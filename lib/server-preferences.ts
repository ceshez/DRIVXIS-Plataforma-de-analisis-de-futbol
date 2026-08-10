import { cookies } from "next/headers";
import { LOCALE_COOKIE, THEME_COOKIE, normalizeLocale, normalizeTheme } from "@/lib/preferences";

export async function getServerPreferences() {
  const cookieStore = await cookies();
  return {
    locale: normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value),
    theme: normalizeTheme(cookieStore.get(THEME_COOKIE)?.value),
  };
}
