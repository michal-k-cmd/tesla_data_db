// Sjednocený tvar produktu pro porovnání Helios ↔ e-shop. Oba zdroje mají
// jiné názvy polí i zápisy hodnot („3W" vs. „3 W", „NE"/„Ne"/„ne", záruka
// „3 roky" vs. „36") – tady se převádí na společný tvar. Čisté funkce bez DB
// (testovatelné).

export type NormProduct = {
  code: string;
  parent_code: string | null;
  name: string | null;
  ean: string | null;
  /** cena bez DPH (u Heliosu cena_1 – sazba DPH z view není jistá, viz compare) */
  price: number | null;
  price_vat: number | null;
  vat_rate: number | null;
  stock: number | null;
  short_description: string | null;
  description: string | null;
  main_image: string | null;
  images: string[];
  category: string | null;
  manufacturer: string | null;
  warranty_months: number | null;
  dimmable: boolean | null;
  power_w: number | null;
  lumens: number | null;
  color_temp_k: number | null;
  base: string | null;
  voltage_v: number | null;
  beam_angle: number | null;
  ip_rating: string | null;
  visible: boolean | null;
};

export const EMPTY_PRODUCT: Omit<NormProduct, "code"> = {
  parent_code: null, name: null, ean: null, price: null, price_vat: null, vat_rate: null,
  stock: null, short_description: null, description: null, main_image: null, images: [],
  category: null, manufacturer: null, warranty_months: null, dimmable: null, power_w: null,
  lumens: null, color_temp_k: null, base: null, voltage_v: null, beam_angle: null,
  ip_rating: null, visible: null,
};

// ---------------------------------------------------------------------------
// Základní převody hodnot
// ---------------------------------------------------------------------------

/** string bez okrajových mezer; prázdný / jen mezery / null → null */
export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return null;
  const s = String(v).replace(/ /g, " ").trim();
  return s === "" ? null : s;
}

/** číslo z čísla i textu („1 234,50", „40.5", „250lm", „3 W") – první číslo v textu */
export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v);
  if (!s) return null;
  const m = s.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** ano/ne ve všech zápisech (ANO/Ano/ano/true/1, NE/Ne/ne/false/0); jiné → null */
export function yesNo(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (["ano", "yes", "true", "1", "a", "y"].includes(s)) return true;
  if (["ne", "no", "false", "0", "n"].includes(s)) return false;
  return null;
}

/** záruka na měsíce: „3 roky" → 36, „2 roky" → 24, „24" → 24 (holé číslo = měsíce),
 *  „24 měsíců" → 24 */
export function warrantyMonths(v: unknown): number | null {
  const s = str(v)?.toLowerCase();
  if (!s) return typeof v === "number" ? v : null;
  const n = num(s);
  if (n === null) return null;
  if (/rok|let|year/.test(s)) return Math.round(n * 12);
  return Math.round(n);
}

/** barevná teplota v K: „Teplá bílá (3000K)" → 3000, „4000 K" → 4000 */
export function colorTempK(v: unknown): number | null {
  const s = str(v);
  if (!s) return typeof v === "number" ? v : null;
  const m = s.replace(/\s/g, "").match(/(\d{4,5})k/i);
  if (m) return Number(m[1]);
  const n = num(s);
  return n !== null && n >= 1000 && n <= 20000 ? n : null;
}

/** EAN: jen číslice (mezery pryč), jinak null */
export function ean(v: unknown): string | null {
  const s = str(v)?.replace(/\s/g, "");
  return s && /^\d{8,14}$/.test(s) ? s : null;
}

/** krytí: „IP20" / „ip 65" → IP20 / IP65 */
export function ipRating(v: unknown): string | null {
  const s = str(v)?.replace(/\s/g, "").toUpperCase();
  if (!s) return null;
  const m = s.match(/IP\d{2}/);
  return m ? m[0] : s;
}

/** normalizovaný klíč kódu produktu pro párování (trim, velká písmena) */
export function codeKey(v: unknown): string {
  return (str(v) ?? "").toUpperCase();
}

/** klíč pro hledání názvu sloupce: malá písmena, bez diakritiky, jen a-z0-9 */
export function fieldKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// ---------------------------------------------------------------------------
// Helios – view hvw_api_eshop_produkty_basic (sloupce jako sestava
// „eshop_export_kompletni_v1" v kmenových kartách)
// ---------------------------------------------------------------------------

export type HeliosRow = Record<string, unknown>;

const H = "_tabkmenzbozi_";

export function normalizeHelios(row: HeliosRow): NormProduct | null {
  const code = str(row.RegCis);
  if (!code) return null;
  const images = [
    row[`${H}imgbb_main_picture`],
    row[`${H}imgbb_picture_bulb`],
    row[`${H}imgbb_picture_box`],
    row[`${H}imgbb_eprel_picture`],
    row[`${H}imgbb_product_information_sheet`],
  ]
    .map(str)
    .filter((u): u is string => !!u);
  return {
    ...EMPTY_PRODUCT,
    code,
    name: str(row.Nazev1),
    ean: ean(row.barcode),
    price: num(row.cena_1),
    stock: num(row.MnozstviDispo),
    short_description: str(row[`${H}parametry_popis_eshop`]),
    description: str(row[`${H}parametry_eshop_popis_dlouhy`]),
    main_image: str(row[`${H}imgbb_main_picture`]),
    images,
    category: str(row[`${H}parametry_kategorie1`]),
    manufacturer: str(row.NazevVyrobce) ?? str(row[`${H}parametry_vyrobce`]),
    warranty_months: warrantyMonths(row[`${H}parametry_zaruka`]),
    dimmable: yesNo(row[`${H}parametry_stmivatelne`]),
    power_w: num(row[`${H}imgbb_input_power`]) ?? num(row[`${H}parametry_prikon`]),
    lumens: num(row[`${H}imgbb_lumens`]),
    color_temp_k: colorTempK(row[`${H}imgbb_colour_temperature`]),
    base: str(row[`${H}imgbb_base_type`]),
    voltage_v: num(row[`${H}imgbb_input_voltage`]),
    beam_angle: num(row[`${H}imgbb_beam_angle`]),
    ip_rating: ipRating(row[`${H}parametry_ochrana`]),
    visible: yesNo(row.zobrazeno_web),
  };
}

/** Kontroly kvality dat uvnitř Heliosu (jeden řádek view) – co je nekonzistentní
 *  ještě před porovnáním s e-shopem. */
export function heliosIssues(row: HeliosRow): string[] {
  const issues: string[] = [];
  if (num(row.cena_1) === null) issues.push("chybí cena");
  if (!ean(row.barcode)) issues.push("chybí / neplatný EAN");
  if (!str(row.Nazev1)) issues.push("chybí název");
  const p1 = num(row[`${H}imgbb_input_power`]);
  const p2 = num(row[`${H}parametry_prikon`]);
  if (p1 !== null && p2 !== null && p1 !== p2) issues.push(`příkon se liší (${p1} W vs. ${p2} W)`);
  const k1 = str(row[`${H}parametry_kategorie1`]);
  const k2 = str(row[`${H}parametry_kategorie2`]);
  if (k1 && k2 && k1 !== k2) issues.push("kategorie1 ≠ kategorie2");
  const dim = str(row[`${H}parametry_stmivatelne`]);
  if (dim && yesNo(dim) === null) issues.push(`stmívatelné: nejasná hodnota „${dim}"`);
  if (!str(row[`${H}parametry_popis_eshop`])) issues.push("chybí krátký popis");
  return issues;
}
