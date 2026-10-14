// Formátování pro UI (čeština, Europe/Prague).

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "–";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "–";
  return d.toLocaleString("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtNum(v: unknown, digits = 0): string {
  if (v === null || v === undefined || v === "") return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString("cs-CZ", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "ano" : "ne";
  if (typeof v === "number") return fmtNum(v, 2);
  return String(v);
}

export function truncate(s: string, max = 120): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
