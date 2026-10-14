"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Zjistí odchozí IP appky a zapíše ji do logu (kvůli IP whitelistu Helios API). */
export function EgressCheck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const res = await fetch("/api/helios/egress", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.ip) {
              setMsg({ ok: true, text: `odchozí IP ${data.ip}${data.region ? ` (region ${data.region})` : ""}` });
              router.refresh();
            } else setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "zjišťuji…" : "zjistit odchozí IP"}
      </button>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
    </span>
  );
}
