"use client";

import { useCallback, useEffect, useState } from "react";

type Section = { key: string; label: string };
type User = { email: string; sections: string[]; is_admin: boolean; enabled: boolean; note: string | null; updated_by?: string | null };

const EMPTY: User = { email: "", sections: [], is_admin: false, enabled: true, note: "" };

export function UsersPanel({ sections }: { sections: Section[] }) {
  const [users, setUsers] = useState<User[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState<User>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/app-users");
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setUsers(data.users ?? []); setNote(data.note ?? null); }
    else setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = (key: string) =>
    setForm((f) => ({ ...f, sections: f.sections.includes(key) ? f.sections.filter((s) => s !== key) : [...f.sections, key] }));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/app-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) { setMsg({ ok: true, text: `uloženo: ${data.user.email}` }); setForm(EMPTY); await load(); }
    else setMsg({ ok: false, text: data.error ?? `HTTP ${res.status}` });
  }

  async function remove(email: string) {
    if (!window.confirm(`Odebrat přístup uživateli ${email}?`)) return;
    const res = await fetch("/api/app-users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) await load();
    else setMsg({ ok: false, text: `smazání selhalo (HTTP ${res.status})` });
  }

  const label = (key: string) => sections.find((s) => s.key === key)?.label ?? key;

  return (
    <>
      {note && <p className="msg err">{note}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>e-mail</th><th>sekce</th><th>admin</th><th>aktivní</th><th>poznámka</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email}>
                <td>{u.email}</td>
                <td className="small">{u.sections.includes("*") ? "vše" : u.sections.map(label).join(", ") || "–"}</td>
                <td>{u.is_admin ? "ano" : "ne"}</td>
                <td>{u.enabled ? "ano" : "ne"}</td>
                <td className="small">{u.note ?? ""}</td>
                <td className="nowrap">
                  <button type="button" className="secondary" onClick={() => setForm({ ...u, note: u.note ?? "" })}>upravit</button>{" "}
                  <button type="button" className="secondary" onClick={() => remove(u.email)}>odebrat</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={6} className="muted">zatím žádní uživatelé (superadmin má přístup vždy)</td></tr>}
          </tbody>
        </table>
      </div>

      <h3>{users.some((u) => u.email === form.email.trim().toLowerCase()) ? "Upravit uživatele" : "Přidat uživatele"}</h3>
      <div className="row">
        <input type="email" placeholder="e-mail účtu na vinisto platformě" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ minWidth: 280 }} />
        <input type="text" placeholder="poznámka (nepovinné)" value={form.note ?? ""}
          onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ minWidth: 220 }} />
      </div>
      <div className="chips">
        {sections.map((s) => (
          <label key={s.key} className="chip" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={form.sections.includes(s.key)} onChange={() => toggle(s.key)} /> {s.label}
          </label>
        ))}
      </div>
      <div className="row">
        <label><input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} /> admin appky (spravuje uživatele)</label>
        <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> aktivní</label>
        <button type="button" disabled={busy || !form.email || form.sections.length === 0} onClick={save}>uložit</button>
        {form.email && <button type="button" className="secondary" onClick={() => setForm(EMPTY)}>zrušit</button>}
      </div>
      {msg && <div className={`msg ${msg.ok ? "ok" : "err"}`}>{msg.text}</div>}
    </>
  );
}
