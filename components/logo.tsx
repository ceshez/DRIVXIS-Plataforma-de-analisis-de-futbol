"use client";

import Link from "next/link";
import Image from "next/image";

type LogoProps = {
  href?: string;
};

export function Logo({ href = "/" }: LogoProps) {
  return (
    <Link className="brand-mark" href={href} aria-label="DRIVXIS inicio">
      <Image className="brand-logo" src="/logos/drivxis-logo-claro.svg" alt="DRIVXIS" width={90} height={22} />
    </Link>
  );
}
