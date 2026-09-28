// Uložení a čtení klonů produktů. Každé načtení = PLNÝ SNÍMEK zdroje:
// DELETE + INSERT v jedné transakci (buď je v DB celý nový snímek, nebo
// zůstane ten starý). Prázdný výsledek importu data NEMAŽE.

import { getPool } from "./db";
import type { NormProduct } from "./normalize";

export type SourceKey = "helios" | "shoptet";

const TABLE: Record<SourceKey, string> = { helios: "helios_products", shoptet: "shoptet_products" };
const BATCH = 200;

export async function replaceSnapshot(
  source: SourceKey,
  rows: { raw: Record<string, unknown>; norm: NormProduct }[],
  origin: "api" | "import",
): Promise<number> {
  if (rows.length === 0) throw new Error("prázdný snímek – data se nemažou");
  const table = TABLE[source];
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM ${table}`);
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values: unknown[] = [];
      const tuples = chunk.map((r, j) => {
        const b = j * 8;
        const n = r.norm;
        const priceCol = source === "helios" ? n.price : n.price_vat;
        values.push(n.code, n.name, n.ean, priceCol, n.stock, JSON.stringify(r.raw), JSON.stringify(n), origin);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8})`;
      });
      const priceName = source === "helios" ? "price" : "price_vat";
      await client.query(
        `INSERT INTO ${table} (code, name, ean, ${priceName}, stock, raw, norm, source)
         VALUES ${tuples.join(",")}
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, ean = EXCLUDED.ean,
           ${priceName} = EXCLUDED.${priceName}, stock = EXCLUDED.stock, raw = EXCLUDED.raw,
           norm = EXCLUDED.norm, source = EXCLUDED.source, synced_at = now()`,
        values,
      );
    }
    await client.query("COMMIT");
    return rows.length;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export type StoredProduct = {
  code: string;
  norm: NormProduct;
  raw: Record<string, unknown>;
  synced_at: string;
};

export async function loadProducts(source: SourceKey): Promise<StoredProduct[]> {
  try {
    const { rows } = await getPool().query(`SELECT code, norm, raw, synced_at FROM ${TABLE[source]} ORDER BY code`);
    return rows;
  } catch {
    return [];
  }
}

export type SourceStats = { count: number; synced_at: string | null; origin: string | null };

export async function sourceStats(source: SourceKey): Promise<SourceStats> {
  try {
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS count, max(synced_at) AS synced_at,
              (SELECT source FROM ${TABLE[source]} ORDER BY synced_at DESC LIMIT 1) AS origin
       FROM ${TABLE[source]}`,
    );
    return { count: rows[0].count, synced_at: rows[0].synced_at, origin: rows[0].origin };
  } catch {
    return { count: 0, synced_at: null, origin: null };
  }
}
