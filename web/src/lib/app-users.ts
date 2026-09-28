// Uživatelé appky + práva na sekce (Nastavení → uživatelé a práva).
// Přihlášení běží proti vinisto platformě; tahle tabulka říká, KDO smí
// do appky (mimo superadminy, ti mají vždy vše) a KTERÉ sekce vidí.
// Vzor: michal-k-cmd/vinisto_data_db web/src/lib/app-users.ts.

import { getPool } from "./db";
import { APP_SECTION_KEYS } from "@/config/app-sections";

export type AppUser = {
  email: string;
  sections: string[];
  is_admin: boolean;
  enabled: boolean;
  note: string | null;
  created_at?: string;
  updated_by?: string | null;
  updated_at?: string | null;
};

const normEmail = (email: string): string => email.trim().toLowerCase();

/** validní klíče sekcí (+ "*" = vše); neznámé se tiše zahodí */
export function cleanSections(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const key = String(item ?? "").trim();
    if ((key === "*" || APP_SECTION_KEYS.has(key)) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** aktivní uživatel appky; null = nemá přístup (nebo tabulka neexistuje –
 *  fail-closed, ne-superadmin se nepřihlásí, superadmina to neomezuje) */
export async function getAppUser(email: string): Promise<AppUser | null> {
  try {
    const { rows } = await getPool().query(
      "SELECT email, sections, is_admin, enabled, note FROM app_users WHERE email = $1 AND enabled",
      [normEmail(email)],
    );
    if (rows.length === 0) return null;
    return { ...rows[0], sections: cleanSections(rows[0].sections) };
  } catch {
    return null;
  }
}

export async function listAppUsers(): Promise<AppUser[]> {
  const { rows } = await getPool().query(
    `SELECT email, sections, is_admin, enabled, note, created_at, updated_by, updated_at
     FROM app_users ORDER BY email`,
  );
  return rows.map((r) => ({ ...r, sections: cleanSections(r.sections) }));
}

export async function upsertAppUser(user: {
  email: string; sections: unknown; is_admin?: boolean; enabled?: boolean; note?: string | null;
}, updatedBy: string): Promise<AppUser> {
  const email = normEmail(user.email);
  if (!email || !email.includes("@")) throw new Error("e-mail je povinný");
  const { rows } = await getPool().query(
    `INSERT INTO app_users (email, sections, is_admin, enabled, note, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (email) DO UPDATE SET sections = EXCLUDED.sections,
       is_admin = EXCLUDED.is_admin, enabled = EXCLUDED.enabled, note = EXCLUDED.note,
       updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING email, sections, is_admin, enabled, note, created_at, updated_by, updated_at`,
    [email, JSON.stringify(cleanSections(user.sections)), user.is_admin === true,
      user.enabled !== false, user.note ?? null, updatedBy],
  );
  return { ...rows[0], sections: cleanSections(rows[0].sections) };
}

export async function deleteAppUser(email: string): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM app_users WHERE email = $1", [normEmail(email)]);
  return Boolean(rowCount);
}
