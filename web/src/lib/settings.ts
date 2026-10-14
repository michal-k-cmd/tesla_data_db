import { getPool } from "./db";

// Key/value nastavení appky (tabulka sync_settings, JSONB) – stejný vzor jako
// vinisto_data_db. Čtení odolné vůči chybějící tabulce (před „Inicializovat DB").

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const { rows } = await getPool().query("SELECT value FROM sync_settings WHERE key = $1", [key]);
    return rows.length ? (rows[0].value as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO sync_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}
