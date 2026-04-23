"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button className="button ghost" type="button" onClick={logout}>
      Salir
    </button>
  );
}
