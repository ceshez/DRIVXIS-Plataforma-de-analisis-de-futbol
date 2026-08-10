"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { type AppLocale, type AppTheme, type UiCopyKey, translate } from "@/lib/preferences";

type AppPreferencesContextValue = {
  locale: AppLocale;
  theme: AppTheme;
  savingPreferences: boolean;
  t: (key: UiCopyKey) => string;
  savePreferences: (next: { locale?: AppLocale; theme?: AppTheme }) => Promise<boolean>;
};

const AppPreferencesContext = createContext<AppPreferencesContextValue | null>(null);

export function AppPreferencesProvider({ children, initialLocale, initialTheme }: {
  children: React.ReactNode;
  initialLocale: AppLocale;
  initialTheme: AppTheme;
}) {
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState(initialTheme);
  const [savingPreferences, setSavingPreferences] = useState(false);

  const savePreferences = useCallback(async (next: { locale?: AppLocale; theme?: AppTheme }) => {
    const previous = { locale, theme };
    const optimisticLocale = next.locale ?? locale;
    const optimisticTheme = next.theme ?? theme;
    setLocale(optimisticLocale);
    setTheme(optimisticTheme);
    document.documentElement.lang = optimisticLocale;
    document.documentElement.dataset.theme = optimisticTheme;
    setSavingPreferences(true);

    try {
      const response = await fetch("/api/profile/preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Preference update failed");
      return true;
    } catch {
      setLocale(previous.locale);
      setTheme(previous.theme);
      document.documentElement.lang = previous.locale;
      document.documentElement.dataset.theme = previous.theme;
      return false;
    } finally {
      setSavingPreferences(false);
    }
  }, [locale, theme]);

  const value = useMemo<AppPreferencesContextValue>(() => ({
    locale, theme, savingPreferences, t: (key) => translate(locale, key), savePreferences,
  }), [locale, savePreferences, savingPreferences, theme]);

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (!context) throw new Error("useAppPreferences must be used inside AppPreferencesProvider.");
  return context;
}
