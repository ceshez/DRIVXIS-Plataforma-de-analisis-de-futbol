"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

type NavItem = {
  href: string;
  label: string;
};

type SiteHeaderProps = {
  navItems: NavItem[];
  action?: React.ReactNode;
  logoHref?: string;
};

export function SiteHeader({ navItems, action, logoHref = "/" }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className={`site-header ${open ? "is-open" : ""}`}>
      <div className="site-header__bar">
        <Logo href={logoHref} />

        <nav className="site-nav" aria-label="Navegacion principal">
          {navItems.map((item) =>
            item.href.startsWith("/") ? (
              <Link href={item.href} key={item.href}>
                {item.label}
              </Link>
            ) : (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ),
          )}
        </nav>

        <div className="header-actions">
          <div className="header-actions__desktop">{action}</div>
          <button
            className={`menu-toggle ${open ? "is-open" : ""}`}
            type="button"
            aria-label={open ? "Cerrar menu" : "Abrir menu"}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      <div className={`mobile-menu ${open ? "is-open" : ""}`}>
        <div className="mobile-menu__sheet" role="dialog" aria-modal="true" aria-label="Menu principal">
          <div className="mobile-menu__top">
            <Logo href={logoHref} />
            <button className="menu-toggle is-close" type="button" aria-label="Cerrar menu" onClick={() => setOpen(false)}>
              <span />
              <span />
            </button>
          </div>

          <nav className="mobile-menu__nav" aria-label="Navegacion movil">
            {navItems.map((item, index) =>
              item.href.startsWith("/") ? (
                <Link href={item.href} key={item.href} onClick={() => setOpen(false)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.label}
                </Link>
              ) : (
                <a href={item.href} key={item.href} onClick={() => setOpen(false)}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.label}
                </a>
              ),
            )}
          </nav>

          <div className="mobile-menu__cta">{action}</div>
        </div>
      </div>
    </header>
  );
}
