"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Tlačítko, které zavolá POST na API a obnoví stránku. */
export function ActionButton({
  url,
  label,
  confirmText,
  secondary,
}: {
  url: string;
  label: string;
  confirmText?: string;
  secondary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span>
      <button
        type="button"
        className={secondary ? "secondary" : undefined}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch(url, { method: "POST" });
            const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            if (res.ok && data.ok !== false) {
              setMsg({ ok: true, text: data.rows !== undefined ? `hotovo – ${data.rows} řádků` : "hotovo" });
              router.refresh();
            } else setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
          } catch (e) {
            setMsg({ ok: false, text: String(e) });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "pracuji…" : label}
      </button>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
    </span>
  );
}
