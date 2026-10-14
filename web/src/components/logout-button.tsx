"use client";

import { useState } from "react";
import { Icon } from "./icons";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="topbar-logout"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.href = "/login";
      }}
    >
      <Icon name="logout" size={15} /> odhlásit
    </button>
  );
}
