import type { Metadata, Viewport } from "next";
import { Inter, Orbitron } from "next/font/google";
import { AppPreferencesProvider } from "@/components/app-preferences-provider";
import { getServerPreferences } from "@/lib/server-preferences";
import "./globals.css";

const display = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DRIVXIS | análisis inteligente de fútbol",
  description: "Plataforma web para convertir videos de fútbol en estadísticas tácticas accionables.",
  icons: {
    icon: [
      { url: "/logos/drivxis-logo-oscuro.ico" },
      {
        url: "/logos/drivxis-logo-oscuro.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/logos/drivxis-logo-claro.svg",
        type: "image/svg+xml",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    shortcut: ["/logos/drivxis-logo-oscuro.ico"],
    apple: [
      {
        url: "/logos/drivxis-logo-oscuro.svg",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/logos/drivxis-logo-claro.svg",
        media: "(prefers-color-scheme: dark)",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preferences = await getServerPreferences();

  return (
    <html lang={preferences.locale} data-theme={preferences.theme} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable}`}>
        <AppPreferencesProvider initialLocale={preferences.locale} initialTheme={preferences.theme}>
          {children}
        </AppPreferencesProvider>
      </body>
    </html>
  );
}

