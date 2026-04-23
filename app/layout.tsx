import type { Metadata, Viewport } from "next";
import { Manrope, Orbitron } from "next/font/google";
import "./globals.css";

const display = Orbitron({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "DRIVXIS | Analisis inteligente de futbol",
  description: "Plataforma web para convertir videos de futbol en estadisticas tacticas accionables.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${display.variable} ${body.variable} min-h-screen bg-drivxis-bg text-drivxis-text antialiased`}>
        {children}
      </body>
    </html>
  );
}
