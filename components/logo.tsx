"use client";

import Link from "next/link";
import Image from "next/image";
import { useAppPreferences } from "@/components/app-preferences-provider";

type LogoProps = {
  href?: string;
};

export function Logo({ href = "/" }: LogoProps) {
  const { locale } = useAppPreferences();
  return (
    <Link className="brand-mark" href={href} aria-label={locale === "en" ? "DRIVXIS home" : "Inicio de DRIVXIS"}>
      <Image
        className="brand-logo brand-logo--for-dark"
        src="/logos/drivxis-logo-claro.svg"
        alt="DRIVXIS"
        width={90}
        height={22}
        style={{ width: "clamp(66px, 7vw, 90px)", height: "auto" }}
      />
      <Image
        className="brand-logo brand-logo--for-light"
        src="/logos/drivxis-logo-oscuro.svg"
        alt="DRIVXIS"
        width={90}
        height={22}
        style={{ width: "clamp(66px, 7vw, 90px)", height: "auto" }}
      />
    </Link>
  );
}
