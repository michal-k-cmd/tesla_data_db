"use client";

import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="login-fields"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          if (res.ok) {
            window.location.href = "/";
            return;
          }
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? `Přihlášení selhalo (HTTP ${res.status})`);
        } catch {
          setError("Přihlášení momentálně není dostupné");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor="email">E-mail</label>
      <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label htmlFor="password">Heslo</label>
      <input id="password" type="password" autoComplete="current-password" value={password}
        onChange={(e) => setPassword(e.target.value)} required />
      <button type="submit" disabled={busy || !email || !password}>{busy ? "přihlašuji…" : "Přihlásit"}</button>
      {error && <div className="msg err">{error}</div>}
    </form>
  );
}
