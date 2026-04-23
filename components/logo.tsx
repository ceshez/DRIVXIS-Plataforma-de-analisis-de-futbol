import Link from "next/link";

type LogoProps = {
  href?: string;
  compact?: boolean;
};

export function Logo({ href = "/", compact = false }: LogoProps) {
  return (
    <Link className="brand-mark" href={href} aria-label="DRIVXIS inicio">
      <span className="brand-symbol" aria-hidden="true">
        <img className="brand-symbol-dark" src="/logos/drivxis-logo-oscuro.svg" alt="" />
        <img className="brand-symbol-light" src="/logos/drivxis-logo-claro.svg" alt="" />
      </span>
      {!compact && (
        <span className="brand-word">
          DRIVXIS
          <small>Football intelligence</small>
        </span>
      )}
    </Link>
  );
}
