import { cookies } from "next/headers";
import { type AppLocale, type AppTheme, LOCALE_COOKIE, THEME_COOKIE } from "@/lib/preferences";

export async function setPreferenceCookies(preferences: { locale: AppLocale; theme: AppTheme }) {
  const cookieStore = await cookies();
  const options = {
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  };
  cookieStore.set(LOCALE_COOKIE, preferences.locale, options);
  cookieStore.set(THEME_COOKIE, preferences.theme, options);
}
