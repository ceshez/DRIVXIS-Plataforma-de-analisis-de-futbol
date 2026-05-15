"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Gauge, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type UserProfileMenuProps = {
  name?: string | null;
  email?: string | null;
  hasAvatar?: boolean;
  avatarVersion?: string | null;
  dropdownDirection?: "down" | "up";
  triggerVariant?: "icon" | "sidebar-card";
  showSidebarSettingsIcon?: boolean;
};

const menuItems = [
  { href: "/dashboard/videos", label: "An\u00e1lisis", icon: BarChart3 },
  { href: "/dashboard/usage", label: "Uso", icon: Gauge },
  { href: "/dashboard/profile", label: "Perfil", icon: UserRound },
];

export function UserProfileMenu({
  name,
  email,
  hasAvatar = false,
  avatarVersion = null,
  dropdownDirection = "down",
  triggerVariant = "icon",
  showSidebarSettingsIcon = false,
}: UserProfileMenuProps) {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [avatarVisible, setAvatarVisible] = useState(hasAvatar);
  const [avatarNonce, setAvatarNonce] = useState(() => avatarVersion || "0");
  const safeName = (name || "").trim();
  const safeEmail = (email || "").trim();

  const avatarLetter = useMemo(() => {
    const source = safeName || safeEmail || "U";
    return source.charAt(0).toUpperCase();
  }, [safeName, safeEmail]);

  useEffect(() => {
    setOpen(false);
    setLogoutError("");
  }, [pathname]);

  useEffect(() => {
    setAvatarVisible(hasAvatar);
  }, [hasAvatar]);

  useEffect(() => {
    if (!avatarVersion) return;
    setAvatarNonce(avatarVersion);
  }, [avatarVersion]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    function handleAvatarUpdated(event: Event) {
      const detail = (event as CustomEvent<{ updatedAt?: string }>).detail;
      setAvatarVisible(true);
      setAvatarNonce(detail?.updatedAt || String(Date.now()));
    }

    window.addEventListener("drivxis:avatar-updated", handleAvatarUpdated);
    return () => window.removeEventListener("drivxis:avatar-updated", handleAvatarUpdated);
  }, []);

  async function logout() {
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setLogoutError("No se pudo cerrar sesi\u00f3n. Intenta de nuevo.");
        setLoggingOut(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setLogoutError("No se pudo cerrar sesi\u00f3n. Revisa tu conexi\u00f3n.");
      setLoggingOut(false);
    }
  }

  return (
    <div
      className={`profile-menu ${dropdownDirection === "up" ? "profile-menu--up" : ""} ${
        triggerVariant === "sidebar-card" ? "profile-menu--sidebar-card" : ""
      }`}
      ref={rootRef}
    >
      <button
        className={`profile-menu__trigger ${triggerVariant === "sidebar-card" ? "profile-menu__trigger--sidebar-card" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir men\u00fa de usuario"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="profile-menu__trigger-avatar-wrap">
          {avatarVisible ? (
            <img
              src={`/api/profile/avatar?v=${encodeURIComponent(avatarNonce)}`}
              alt="Avatar de usuario"
              className="profile-menu__avatar-image"
              onError={() => setAvatarVisible(false)}
            />
          ) : (
            <span className="profile-menu__avatar" aria-hidden="true">
              {avatarLetter}
            </span>
          )}
        </span>
        {triggerVariant === "sidebar-card" ? (
          <>
            <span className="profile-menu__trigger-copy">
              <strong>{safeName || "Usuario DRIVXIS"}</strong>
              <span>{safeEmail || "sin correo"}</span>
            </span>
            {showSidebarSettingsIcon ? <Settings size={14} className="profile-menu__trigger-settings" /> : null}
          </>
        ) : null}
      </button>

      {open ? (
        <div className="profile-menu__dropdown" role="menu" aria-label="Men\u00fa de usuario">
          <div className="profile-menu__identity">
            <span className="profile-menu__identity-avatar" aria-hidden="true">
              {avatarVisible ? (
                <img
                  src={`/api/profile/avatar?v=${encodeURIComponent(avatarNonce)}`}
                  alt=""
                  className="profile-menu__identity-avatar-image"
                />
              ) : (
                avatarLetter
              )}
            </span>
            <div className="profile-menu__identity-copy">
              <strong>{safeName || "Usuario DRIVXIS"}</strong>
              {safeEmail ? <span>{safeEmail}</span> : null}
            </div>
          </div>

          <div className="profile-menu__links">
            {menuItems.map((item) => (
              <Link
                href={item.href}
                key={item.href}
                role="menuitem"
                className={`profile-menu__item ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? "is-active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <item.icon size={16} />
                <strong>{item.label}</strong>
              </Link>
            ))}
            <button
              type="button"
              role="menuitem"
              className="profile-menu__item"
              onClick={() => void logout()}
              disabled={loggingOut}
            >
              <LogOut size={16} />
              <strong>{loggingOut ? "CERRANDO SESI\u00d3N..." : "CERRAR SESI\u00d3N"}</strong>
            </button>
          </div>
          {logoutError ? <p className="profile-menu__error">{logoutError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

