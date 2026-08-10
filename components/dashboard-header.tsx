"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppPreferences } from "@/components/app-preferences-provider";
import { Logo } from "@/components/logo";

type DashboardNavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type DashboardHeaderProps = {
  logoHref?: string;
  navLabel?: string;
  navItems: DashboardNavItem[];
  action?: React.ReactNode;
};

export function DashboardHeader({
  logoHref = "/dashboard",
  navLabel = "Dashboard",
  navItems,
  action,
}: DashboardHeaderProps) {
  const pathname = usePathname();
  const { t } = useAppPreferences();

  function localizeLabel(label: string) {
    if (label === "Panel") return t("dashboard");
    if (label === "Historial") return t("history");
    if (label === "Uso") return t("usage");
    return label;
  }

  function isActive(item: DashboardNavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  return (
    <header className="app-header">
      <Logo href={logoHref} />
      <nav className="app-header__nav" aria-label={navLabel}>
        {navItems.map((item) => (
          <Link href={item.href} key={item.href} className={isActive(item) ? "is-active" : undefined}>
            {localizeLabel(item.label)}
          </Link>
        ))}
      </nav>
      <div className="app-header__action">{action}</div>
    </header>
  );
}
