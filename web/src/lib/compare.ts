// Porovnání Helios ↔ e-shop po polích. Počítá se NA ČTENÍ z uložených
// snímků (žádná materializace). Párování: kód produktu (Helios RegCis =
// kód v e-shopu), pro zbylé EAN. Výsledek slouží k rozhodnutí, který zdroj
// je u kterého pole „master" – teprve pak přijde synchronizace.

import { codeKey, NormProduct } from "./normalize";
import type { StoredProduct } from "./products-store";

export type FieldKind = "text" | "html" | "number" | "bool" | "image";
export type Master = "helios" | "shoptet" | "rozhodnout";

export type FieldDef = {
  key: keyof NormProduct | "price_cmp";
  label: string;
  kind: FieldKind;
  /** tolerance u čísel (absolutní) */
  tol?: number;
  /** navržený master – jen NÁVRH k potvrzení, sync zatím neexistuje */
  master: Master;
};

export const FIELDS: FieldDef[] = [
  { key: "name", label: "název", kind: "text", master: "rozhodnout" },
  { key: "ean", label: "EAN", kind: "text", master: "helios" },
  { key: "price_cmp", label: "cena bez DPH", kind: "number", tol: 0.5, master: "helios" },
  { key: "stock", label: "sklad (ks)", kind: "number", tol: 0, master: "helios" },
  { key: "short_description", label: "krátký popis", kind: "html", master: "shoptet" },
  { key: "description", label: "dlouhý popis", kind: "html", master: "shoptet" },
  { key: "main_image", label: "hlavní obrázek", kind: "image", master: "shoptet" },
  { key: "category", label: "kategorie", kind: "text", master: "shoptet" },
  { key: "manufacturer", label: "výrobce", kind: "text", master: "rozhodnout" },
  { key: "warranty_months", label: "záruka (měsíce)", kind: "number", tol: 0, master: "rozhodnout" },
  { key: "dimmable", label: "stmívatelné", kind: "bool", master: "rozhodnout" },
  { key: "power_w", label: "příkon (W)", kind: "number", tol: 0.05, master: "rozhodnout" },
  { key: "lumens", label: "světelný tok (lm)", kind: "number", tol: 0.5, master: "rozhodnout" },
  { key: "color_temp_k", label: "barevná teplota (K)", kind: "number", tol: 0, master: "rozhodnout" },
  { key: "base", label: "patice", kind: "text", master: "rozhodnout" },
  { key: "ip_rating", label: "krytí IP", kind: "text", master: "rozhodnout" },
];

export type CellStatus = "equal" | "different" | "only_helios" | "only_shoptet" | "both_empty";

export type FieldStats = {
  key: string;
  label: string;
  master: Master;
  equal: number;
  different: number;
  only_helios: number;
  only_shoptet: number;
  both_empty: number;
};

export type PairRow = {
  code: string;
  shoptet_code: string;
  matched_by: "code" | "ean";
  name: string | null;
  cells: Record<string, { status: CellStatus; helios: unknown; shoptet: unknown }>;
  diff_count: number;
};

export type CompareOptions = {
  /** jak číst cenu z Heliosu (cena_1): bez DPH (default) nebo s DPH */
  heliosPriceVat: "without" | "with";
  /** sazba DPH pro přepočet, když ji zdroj nenese */
  defaultVat: number;
};

export type CompareResult = {
  helios_total: number;
  shoptet_total: number;
  matched_by_code: number;
  matched_by_ean: number;
  only_helios: { code: string; name: string | null; ean: string | null }[];
  only_shoptet: { code: string; name: string | null; ean: string | null }[];
  fields: FieldStats[];
  pairs: PairRow[];
  /** medián poměru cena Helios / cena e-shopu s DPH – napoví, zda je cena_1 s DPH */
  price_ratio_median: number | null;
  helios_synced_at: string | null;
  shoptet_synced_at: string | null;
  options: CompareOptions;
};

// ---------------------------------------------------------------------------
// Porovnání hodnot
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

export function htmlToText(v: string): string {
  return v
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h\d)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (k in ENTITIES) return ENTITIES[k];
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
      if (k.startsWith("#")) return String.fromCodePoint(Number(k.slice(1)));
      return m;
    });
}

const normText = (v: string): string => v.replace(/\s+/g, " ").trim().toLowerCase();

/** název souboru obrázku bez query a bez velikostní cesty CDN */
export function imageKey(url: string): string {
  const path = url.split("?")[0];
  return path.slice(path.lastIndexOf("/") + 1).toLowerCase();
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export function compareValues(kind: FieldKind, a: unknown, b: unknown, tol = 0): CellStatus {
  // HTML bez textu („<p></p>", „&nbsp;") je prázdná hodnota
  const empty = (v: unknown) => isEmpty(v) || (kind === "html" && htmlToText(String(v)).trim() === "");
  const ea = empty(a);
  const eb = empty(b);
  if (ea && eb) return "both_empty";
  if (ea) return "only_shoptet";
  if (eb) return "only_helios";
  switch (kind) {
    case "number":
      return Math.abs(Number(a) - Number(b)) <= tol + 1e-9 ? "equal" : "different";
    case "bool":
      return a === b ? "equal" : "different";
    case "html":
      return normText(htmlToText(String(a))) === normText(htmlToText(String(b))) ? "equal" : "different";
    case "image":
      return imageKey(String(a)) === imageKey(String(b)) ? "equal" : "different";
    default:
      return normText(String(a)) === normText(String(b)) ? "equal" : "different";
  }
}

// ---------------------------------------------------------------------------
// Výpočet
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** cena bez DPH pro porovnání */
function heliosPrice(n: NormProduct, o: CompareOptions): number | null {
  if (n.price === null) return null;
  return o.heliosPriceVat === "with" ? round2(n.price / (1 + (n.vat_rate ?? o.defaultVat) / 100)) : n.price;
}

function shoptetPrice(n: NormProduct, o: CompareOptions): number | null {
  if (n.price !== null) return n.price;
  if (n.price_vat !== null) return round2(n.price_vat / (1 + (n.vat_rate ?? o.defaultVat) / 100));
  return null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeCompare(
  helios: StoredProduct[],
  shoptet: StoredProduct[],
  options: Partial<CompareOptions> = {},
): CompareResult {
  const o: CompareOptions = { heliosPriceVat: options.heliosPriceVat ?? "without", defaultVat: options.defaultVat ?? 21 };

  const shopByCode = new Map<string, StoredProduct>();
  const shopByEan = new Map<string, StoredProduct[]>();
  for (const s of shoptet) {
    shopByCode.set(codeKey(s.norm.code), s);
    if (s.norm.ean) shopByEan.set(s.norm.ean, [...(shopByEan.get(s.norm.ean) ?? []), s]);
  }

  const usedShop = new Set<string>();
  const pairs: { h: StoredProduct; s: StoredProduct; by: "code" | "ean" }[] = [];
  const unmatchedHelios: StoredProduct[] = [];
  for (const h of helios) {
    const s = shopByCode.get(codeKey(h.norm.code));
    if (s) { pairs.push({ h, s, by: "code" }); usedShop.add(codeKey(s.norm.code)); }
    else unmatchedHelios.push(h);
  }
  // druhé kolo: EAN, jen jednoznačná shoda a jen dosud nespárované produkty e-shopu
  const onlyHelios: StoredProduct[] = [];
  for (const h of unmatchedHelios) {
    const cands = h.norm.ean ? (shopByEan.get(h.norm.ean) ?? []).filter((s) => !usedShop.has(codeKey(s.norm.code))) : [];
    if (cands.length === 1) { pairs.push({ h, s: cands[0], by: "ean" }); usedShop.add(codeKey(cands[0].norm.code)); }
    else onlyHelios.push(h);
  }
  const onlyShoptet = shoptet.filter((s) => !usedShop.has(codeKey(s.norm.code)));

  const stats = new Map<string, FieldStats>(
    FIELDS.map((f) => [String(f.key), { key: String(f.key), label: f.label, master: f.master,
      equal: 0, different: 0, only_helios: 0, only_shoptet: 0, both_empty: 0 }]),
  );
  const ratios: number[] = [];
  const rows: PairRow[] = pairs.map(({ h, s, by }) => {
    const cells: PairRow["cells"] = {};
    let diff = 0;
    for (const f of FIELDS) {
      const hv = f.key === "price_cmp" ? heliosPrice(h.norm, o) : h.norm[f.key as keyof NormProduct];
      const sv = f.key === "price_cmp" ? shoptetPrice(s.norm, o) : s.norm[f.key as keyof NormProduct];
      const status = compareValues(f.kind, hv, sv, f.tol);
      stats.get(String(f.key))![status]++;
      if (status === "different") diff++;
      cells[String(f.key)] = { status, helios: hv ?? null, shoptet: sv ?? null };
    }
    if (h.norm.price && s.norm.price_vat) ratios.push(h.norm.price / s.norm.price_vat);
    return { code: h.norm.code, shoptet_code: s.norm.code, matched_by: by, name: s.norm.name ?? h.norm.name, cells, diff_count: diff };
  });

  const brief = (p: StoredProduct) => ({ code: p.norm.code, name: p.norm.name, ean: p.norm.ean });
  const latest = (list: StoredProduct[]) => {
    const max = list.reduce((m, p) => Math.max(m, new Date(p.synced_at).getTime() || 0), 0);
    return max ? new Date(max).toISOString() : null;
  };

  return {
    helios_total: helios.length,
    shoptet_total: shoptet.length,
    matched_by_code: pairs.filter((p) => p.by === "code").length,
    matched_by_ean: pairs.filter((p) => p.by === "ean").length,
    only_helios: onlyHelios.map(brief),
    only_shoptet: onlyShoptet.map(brief),
    fields: [...stats.values()],
    pairs: rows.sort((a, b) => b.diff_count - a.diff_count || a.code.localeCompare(b.code)),
    price_ratio_median: (() => { const m = median(ratios); return m === null ? null : Math.round(m * 1000) / 1000; })(),
    helios_synced_at: latest(helios),
    shoptet_synced_at: latest(shoptet),
    options: o,
  };
}
