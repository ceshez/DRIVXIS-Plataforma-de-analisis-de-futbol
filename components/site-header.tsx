"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [activeHash, setActiveHash] = useState(navItems[0]?.href ?? "");
  const pathname = usePathname();
  const hashItems = useMemo(() => navItems.filter((item) => item.href.startsWith("#")), [navItems]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (pathname !== "/" || hashItems.length === 0) {
      setActiveHash("");
      return;
    }

    const sections = hashItems
      .map((item) => {
        const id = item.href.slice(1);
        return { href: item.href, node: document.getElementById(id) };
      })
      .filter((section): section is { href: string; node: HTMLElement } => Boolean(section.node));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio);
        if (visible[0]?.target instanceof HTMLElement) {
          const next = sections.find((section) => section.node === visible[0].target);
          if (next) setActiveHash(next.href);
        }
      },
      {
        rootMargin: "-38% 0px -45% 0px",
        threshold: [0.2, 0.35, 0.5, 0.7],
      },
    );

    for (const section of sections) {
      observer.observe(section.node);
    }

    const syncFromHash = () => {
      const nextHash = window.location.hash;
      if (nextHash && hashItems.some((item) => item.href === nextHash)) {
        setActiveHash(nextHash);
      }
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", syncFromHash);
    };
  }, [hashItems, pathname]);

  function getLinkClass(href: string) {
    const classes = [];
    if (href.startsWith("#")) {
      if (pathname === "/" && activeHash === href) classes.push("is-active");
    } else if (pathname === href) {
      classes.push("is-active");
    }
    return classes.join(" ");
  }

  return (
    <header className={`site-header ${open ? "is-open" : ""}`}>
      <div className="site-header__bar">
        <Logo href={logoHref} />

        <nav className="site-nav" aria-label="Navegacion principal">
          {navItems.map((item) =>
            item.href.startsWith("/") ? (
              <Link href={item.href} key={item.href} className={getLinkClass(item.href) || undefined}>
                {item.label}
              </Link>
            ) : (
              <a href={item.href} key={item.href} className={getLinkClass(item.href) || undefined}>
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
                <Link
                  href={item.href}
                  key={item.href}
                  className={getLinkClass(item.href) || undefined}
                  onClick={() => setOpen(false)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item.label}
                </Link>
              ) : (
                <a
                  href={item.href}
                  key={item.href}
                  className={getLinkClass(item.href) || undefined}
                  onClick={() => setOpen(false)}
                >
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
