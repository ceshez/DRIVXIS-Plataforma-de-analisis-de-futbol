"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { BarChart3, Gauge, LogOut, Settings, UserRound } from "lucide-react";
import { useEffect, useMemo, useReducer, useRef } from "react";

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

type ProfileMenuState = {
  open: boolean;
  loggingOut: boolean;
  logoutError: string;
  hasLocalAvatar: boolean;
  avatarNonceOverride: string | null;
  failedAvatarNonce: string | null;
};

type ProfileMenuAction =
  | { type: "toggleOpen" }
  | { type: "close" }
  | { type: "logoutStarted" }
  | { type: "logoutFailed"; message: string }
  | { type: "avatarUpdated"; nonce: string }
  | { type: "avatarFailed"; nonce: string };

const INITIAL_PROFILE_MENU_STATE: ProfileMenuState = {
  open: false,
  loggingOut: false,
  logoutError: "",
  hasLocalAvatar: false,
  avatarNonceOverride: null,
  failedAvatarNonce: null,
};

function profileMenuReducer(state: ProfileMenuState, action: ProfileMenuAction): ProfileMenuState {
  switch (action.type) {
    case "toggleOpen":
      return { ...state, open: !state.open };
    case "close":
      return { ...state, open: false, logoutError: "" };
    case "logoutStarted":
      return { ...state, loggingOut: true, logoutError: "" };
    case "logoutFailed":
      return { ...state, loggingOut: false, logoutError: action.message };
    case "avatarUpdated":
      return {
        ...state,
        hasLocalAvatar: true,
        avatarNonceOverride: action.nonce,
        failedAvatarNonce: null,
      };
    case "avatarFailed":
      return { ...state, failedAvatarNonce: action.nonce };
  }
}

export function UserProfileMenu(props: UserProfileMenuProps) {
  const pathname = usePathname();
  return <UserProfileMenuContent key={pathname} {...props} pathname={pathname} />;
}

function UserProfileMenuContent({
  name,
  email,
  hasAvatar = false,
  avatarVersion = null,
  dropdownDirection = "down",
  triggerVariant = "icon",
  showSidebarSettingsIcon = false,
  pathname,
}: UserProfileMenuProps & { pathname: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuState, dispatchMenu] = useReducer(profileMenuReducer, INITIAL_PROFILE_MENU_STATE);
  const { open, loggingOut, logoutError, hasLocalAvatar, avatarNonceOverride, failedAvatarNonce } = menuState;
  const safeName = (name || "").trim();
  const safeEmail = (email || "").trim();
  const avatarNonce = avatarNonceOverride ?? avatarVersion ?? "0";
  const showAvatar = (hasAvatar || hasLocalAvatar) && failedAvatarNonce !== avatarNonce;

  const avatarLetter = useMemo(() => {
    const source = safeName || safeEmail || "U";
    return source.charAt(0).toUpperCase();
  }, [safeName, safeEmail]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      dispatchMenu({ type: "close" });
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") dispatchMenu({ type: "close" });
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
      dispatchMenu({ type: "avatarUpdated", nonce: detail?.updatedAt || String(Date.now()) });
    }

    window.addEventListener("drivxis:avatar-updated", handleAvatarUpdated);
    return () => window.removeEventListener("drivxis:avatar-updated", handleAvatarUpdated);
  }, []);

  async function logout() {
    dispatchMenu({ type: "logoutStarted" });
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        dispatchMenu({ type: "logoutFailed", message: "No se pudo cerrar sesi\u00f3n. Intenta de nuevo." });
        return;
      }
      window.location.href = "/";
    } catch {
      dispatchMenu({ type: "logoutFailed", message: "No se pudo cerrar sesi\u00f3n. Revisa tu conexi\u00f3n." });
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
        onClick={() => dispatchMenu({ type: "toggleOpen" })}
      >
        <span className="profile-menu__trigger-avatar-wrap">
          {showAvatar ? (
            <Image
              src={`/api/profile/avatar?v=${encodeURIComponent(avatarNonce)}`}
              alt="Avatar de usuario"
              className="profile-menu__avatar-image"
              width={44}
              height={44}
              unoptimized
              onError={() => dispatchMenu({ type: "avatarFailed", nonce: avatarNonce })}
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
              {showAvatar ? (
                <Image
                  src={`/api/profile/avatar?v=${encodeURIComponent(avatarNonce)}`}
                  alt=""
                  className="profile-menu__identity-avatar-image"
                  width={40}
                  height={40}
                  unoptimized
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
                onClick={() => dispatchMenu({ type: "close" })}
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

