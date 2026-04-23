"use client";

import Link from "next/link";

type LogoProps = {
  href?: string;
};

export function Logo({ href = "/" }: LogoProps) {
  return (
    <Link className="brand-mark" href={href} aria-label="DRIVXIS inicio">
      <img className="brand-logo" src="/logos/drivxis-logo-claro.svg" alt="DRIVXIS" />
    </Link>
  );
}
