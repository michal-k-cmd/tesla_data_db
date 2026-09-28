// Import produktů e-shopu (Shoptet) z exportu – CSV (Produkty → Export) nebo
// XML (Shoptet productsComplete / Heureka feed). Mapování sloupců je
// DEFENZIVNÍ: názvy sloupců se hledají podle seznamu kandidátů (bez diakritiky
// a velikosti písmen) a výsledek importu vrací, který sloupec se použil pro
// které pole – ať jde mapování zkontrolovat na reálném exportu. Kompletní
// zdrojový řádek jde vždy do raw.

import iconv from "iconv-lite";
import { XMLParser } from "fast-xml-parser";
import {
  EMPTY_PRODUCT, NormProduct, colorTempK, ean, fieldKey, ipRating, num, str, warrantyMonths, yesNo,
} from "./normalize";

export type ShoptetRow = Record<string, unknown>;
export type ParsedShoptet = {
  format: "csv" | "xml";
  encoding: string;
  rows: { raw: ShoptetRow; norm: NormProduct }[];
  /** pole → název zdrojového sloupce (u XML cesta) */
  mapping: Record<string, string>;
  unmapped_columns: string[];
  skipped: number;
  duplicates: number;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Dekódování souboru (UTF-8 s BOM / bez, fallback Windows-1250)
// ---------------------------------------------------------------------------

export function decodeText(buf: Buffer): { text: string; encoding: string } {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString("utf8"), encoding: "utf-8 (BOM)" };
  }
  const head = buf.subarray(0, 400).toString("latin1");
  const declared = head.match(/encoding=["']([\w-]+)["']/i)?.[1]?.toLowerCase();
  if (declared && /1250/.test(declared)) return { text: iconv.decode(buf, "win1250"), encoding: "windows-1250" };
  const utf = buf.toString("utf8");
  // neplatné UTF-8 sekvence → nejspíš Windows-1250 (český export z Excelu)
  if (utf.includes("�")) return { text: iconv.decode(buf, "win1250"), encoding: "windows-1250" };
  return { text: utf, encoding: "utf-8" };
}

// ---------------------------------------------------------------------------
// CSV parser (oddělovač ; , nebo TAB dle hlavičky, uvozovky, víceřádkové buňky)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
  const nl = text.indexOf("\n");
  const firstLine = nl >= 0 ? text.slice(0, nl) : text;
  const counts = { ";": 0, ",": 0, "\t": 0 } as Record<string, number>;
  let inQ = false;
  for (const ch of firstLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch in counts) counts[ch]++;
  }
  const [bestSep, bestCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const sep = bestCount > 0 ? bestSep : ";";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Mapování polí – kandidáti názvů sloupců (porovnává se přes fieldKey)
// ---------------------------------------------------------------------------

type FieldName = keyof Omit<NormProduct, "images">;

const CANDIDATES: Partial<Record<FieldName, string[]>> = {
  code: ["code", "kod", "productcode", "itemid", "catnum", "katalogovecislo", "sku"],
  parent_code: ["paircode", "parentcode", "itemgroupid"],
  name: ["name", "nazev", "productname", "product", "nazevproduktu"],
  ean: ["ean", "gtin", "barcode", "carovykod"],
  // „price" samotné je v Shoptetu cena S DPH (ceny se zadávají s DPH) – ověřit
  // na exportu; mapování se vrací v odpovědi importu.
  price_vat: ["pricevat", "pricewithvat", "cenasdph", "price", "cena", "finalprice"],
  price: ["pricewithoutvat", "pricenovat", "cenabezdph", "pricebezdph"],
  vat_rate: ["percentvat", "vat", "vatrate", "dph", "sazbadph"],
  stock: ["stock", "stockamount", "amount", "quantity", "sklad", "mnozstvi", "naskladem", "stockquantity"],
  short_description: ["shortdescription", "kratkypopis", "perex"],
  description: ["description", "popis", "longdescription"],
  main_image: ["image", "imgurl", "mainimage", "image1", "obrazek", "defaultimage"],
  category: ["defaultcategory", "category", "categorytext", "kategorie", "categories"],
  manufacturer: ["manufacturer", "vyrobce", "brand", "znacka"],
  warranty_months: ["warranty", "zaruka"],
  visible: ["visible", "visibility", "viditelnost", "active"],
};

/** názvy parametrů (Shoptet TEXT_PROPERTY / Heureka PARAM) → pole */
const PARAM_RULES: { field: FieldName; test: RegExp }[] = [
  { field: "power_w", test: /^(prikon|vykonw|prikonw|power|inputpower)/ },
  { field: "lumens", test: /(svetelnytok|lumen|svitivost)/ },
  { field: "color_temp_k", test: /(chromaticnost|barevnateplota|teplotachromaticnosti|colourtemperature|colortemperature|teplotabarvy)/ },
  { field: "base", test: /^(patice|basetype|zavit)/ },
  { field: "dimmable", test: /stmiv/ },
  { field: "warranty_months", test: /^zaruka/ },
  { field: "ip_rating", test: /^(kryti|ochrana|ip)/ },
  { field: "voltage_v", test: /^(napeti|voltage)/ },
  { field: "beam_angle", test: /(uhelvyzarovani|beamangle|vyzarovaciuhel)/ },
];

function convert(field: FieldName, v: unknown): unknown {
  switch (field) {
    case "ean": return ean(v);
    case "price": case "price_vat": case "vat_rate": case "stock": case "power_w": case "lumens":
    case "voltage_v": case "beam_angle":
      return num(v);
    case "color_temp_k": return colorTempK(v);
    case "warranty_months": return warrantyMonths(v);
    case "dimmable": case "visible": return yesNo(v);
    case "ip_rating": return ipRating(v);
    default: return str(v);
  }
}

/** pole, na které se mapuje název parametru (null = neznámý parametr) */
function paramField(name: unknown): FieldName | null {
  const key = fieldKey(String(name ?? ""));
  if (!key) return null;
  return PARAM_RULES.find((r) => r.test.test(key))?.field ?? null;
}

function applyParam(norm: NormProduct, name: unknown, value: unknown): void {
  const field = paramField(name);
  if (!field) return;
  const current = norm[field];
  if (current !== null && current !== undefined) return; // přímý sloupec má přednost
  const converted = convert(field, value);
  if (converted !== null) (norm as Record<string, unknown>)[field] = converted;
}

function finalizePrices(norm: NormProduct): void {
  if (norm.price === null && norm.price_vat !== null && norm.vat_rate !== null) {
    norm.price = Math.round((norm.price_vat / (1 + norm.vat_rate / 100)) * 100) / 100;
  }
  if (norm.price_vat === null && norm.price !== null && norm.vat_rate !== null) {
    norm.price_vat = Math.round(norm.price * (1 + norm.vat_rate / 100) * 100) / 100;
  }
  if (norm.main_image && !norm.images.includes(norm.main_image)) norm.images.unshift(norm.main_image);
  if (!norm.main_image && norm.images.length) norm.main_image = norm.images[0];
}

// ---------------------------------------------------------------------------
// CSV → produkty
// ---------------------------------------------------------------------------

export function parseShoptetCsv(text: string, encoding = "utf-8"): ParsedShoptet {
  const table = parseCsv(text);
  const warnings: string[] = [];
  if (table.length < 2) {
    return { format: "csv", encoding, rows: [], mapping: {}, unmapped_columns: [], skipped: 0, duplicates: 0,
      warnings: ["soubor nemá hlavičku a data"] };
  }
  const header = table[0].map((h) => h.trim());
  const keys = header.map(fieldKey);
  const mapping: Record<string, string> = {};
  const colFor: Partial<Record<FieldName, number>> = {};
  for (const [field, cands] of Object.entries(CANDIDATES) as [FieldName, string[]][]) {
    for (const cand of cands) {
      const idx = keys.indexOf(cand);
      if (idx >= 0 && !Object.values(colFor).includes(idx)) {
        colFor[field] = idx;
        mapping[field] = header[idx];
        break;
      }
    }
  }
  // obrázky navíc: image2…imageN / imgurlalternative
  const imageCols = keys
    .map((k, i) => ({ k, i }))
    .filter(({ k, i }) => /^(image\d+|imgurlalternative\d*|obrazek\d+)$/.test(k) && i !== colFor.main_image)
    .map(({ i }) => i);
  if (imageCols.length) mapping.images = imageCols.map((i) => header[i]).join(", ");
  const used = new Set<number>([...Object.values(colFor), ...imageCols] as number[]);
  // sloupce s parametry (např. „Příkon", „Patice") – mapují se přes PARAM_RULES
  const paramCols = header.map((h, i) => ({ h, i, field: used.has(i) ? null : paramField(h) })).filter((c) => c.field);
  for (const c of paramCols) mapping[c.field as string] ??= `${c.h} (parametr)`;
  const unmapped = header.filter((_, i) => !used.has(i) && !paramCols.some((c) => c.i === i));

  if (colFor.code === undefined) {
    return { format: "csv", encoding, rows: [], mapping, unmapped_columns: unmapped, skipped: table.length - 1,
      duplicates: 0, warnings: [`nenašel jsem sloupec s kódem produktu (hlavička: ${header.slice(0, 15).join(", ")}…)`] };
  }

  const byCode = new Map<string, { raw: ShoptetRow; norm: NormProduct }>();
  let skipped = 0;
  let duplicates = 0;
  for (const cells of table.slice(1)) {
    const raw: ShoptetRow = {};
    header.forEach((h, i) => { if (h) raw[h] = cells[i] ?? ""; });
    const code = str(cells[colFor.code]);
    if (!code) { skipped++; continue; }
    const norm: NormProduct = { ...EMPTY_PRODUCT, images: [], code };
    for (const [field, idx] of Object.entries(colFor) as [FieldName, number][]) {
      if (field === "code") continue;
      (norm as Record<string, unknown>)[field] = convert(field, cells[idx]);
    }
    for (const i of imageCols) {
      const u = str(cells[i]);
      if (u) norm.images.push(u);
    }
    // parametry v CSV jako sloupce (např. „Příkon", „Patice")
    header.forEach((h, i) => { if (!used.has(i)) applyParam(norm, h, cells[i]); });
    finalizePrices(norm);
    if (byCode.has(code.toUpperCase())) duplicates++;
    byCode.set(code.toUpperCase(), { raw, norm });
  }
  if (duplicates) warnings.push(`${duplicates}× duplicitní kód – použil se poslední výskyt`);
  if (colFor.price_vat !== undefined && keys[colFor.price_vat] === "price") {
    warnings.push("cena z holého sloupce „price\" bereme jako cenu S DPH – ověřte na produktu v adminu");
  }
  return { format: "csv", encoding, rows: [...byCode.values()], mapping, unmapped_columns: unmapped,
    skipped, duplicates, warnings };
}

// ---------------------------------------------------------------------------
// XML (Shoptet SHOP/SHOPITEM s VARIANTS, Heureka SHOP/SHOPITEM, RSS item)
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** text uzlu (fast-xml-parser dává u uzlu s atributy {#text}) */
function text(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) return (v as Obj)["#text"] ?? null;
  return v;
}

/** najde hodnotu v objektu podle kandidátů (klíče porovnává přes fieldKey) */
function pick(obj: Obj, cands: string[]): { key: string; value: unknown } | null {
  const entries = Object.entries(obj).map(([k, v]) => ({ k, fk: fieldKey(k.replace(/^@_/, "")), v }));
  for (const cand of cands) {
    const hit = entries.find((e) => e.fk === cand && typeof text(e.v) !== "object");
    if (hit && str(text(hit.v)) !== null) return { key: hit.k, value: text(hit.v) };
  }
  return null;
}

/** největší opakovaný seznam objektů v dokumentu = položky feedu */
function findItems(doc: unknown): { path: string; items: Obj[] } {
  let best: { path: string; items: Obj[] } = { path: "", items: [] };
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node as Obj)) {
      if (Array.isArray(v)) {
        const objs = v.filter((x) => x && typeof x === "object") as Obj[];
        if (objs.length > best.items.length && !/^(variant|image|param|text_property|parameter|category)s?$/i.test(k)) {
          best = { path: `${path}${k}`, items: objs };
        }
      } else if (typeof v === "object") {
        if (/^(shopitem|item|entry|product)$/i.test(k) && best.items.length === 0) {
          best = { path: `${path}${k}`, items: [v as Obj] };
        }
        walk(v, `${path}${k}.`);
      }
    }
  };
  walk(doc, "");
  return best;
}

function xmlImages(item: Obj): string[] {
  const out: string[] = [];
  for (const key of ["IMAGES", "images"]) {
    const imgs = item[key] as Obj | undefined;
    if (imgs) for (const img of asArray(imgs.IMAGE ?? imgs.image)) { const u = str(text(img)); if (u) out.push(u); }
  }
  for (const key of ["IMGURL", "IMGURL_ALTERNATIVE", "IMAGE", "image", "g:image_link", "g:additional_image_link"]) {
    for (const v of asArray(item[key] as unknown)) { const u = str(text(v)); if (u && !out.includes(u)) out.push(u); }
  }
  return out;
}

function xmlParams(item: Obj, norm: NormProduct): void {
  const groups: [unknown, string, string][] = [
    [(item.TEXT_PROPERTIES as Obj | undefined)?.TEXT_PROPERTY, "NAME", "VALUE"],
    [(item.PARAMETERS as Obj | undefined)?.PARAMETER, "NAME", "VALUE"],
    [(item.INFORMATION_PARAMETERS as Obj | undefined)?.INFORMATION_PARAMETER, "NAME", "VALUE"],
    [item.PARAM, "PARAM_NAME", "VAL"],
  ];
  for (const [list, nameKey, valKey] of groups) {
    for (const p of asArray(list as Obj | Obj[] | undefined)) {
      if (p && typeof p === "object") applyParam(norm, text(p[nameKey]), text(p[valKey] ?? (p as Obj).VALUE));
    }
  }
}

function xmlCategory(item: Obj): string | null {
  const cats = item.CATEGORIES as Obj | undefined;
  if (cats) {
    const def = str(text(cats.DEFAULT_CATEGORY));
    if (def) return def;
    const first = asArray(cats.CATEGORY as unknown)[0];
    if (first) return str(text(first));
  }
  return str(text(item.CATEGORYTEXT)) ?? str(text(item.CATEGORY));
}

function xmlStock(item: Obj): number | null {
  const stock = item.STOCK as Obj | undefined;
  if (stock && typeof stock === "object") return num(text(stock.AMOUNT));
  return num(text(item.STOCK ?? item.STOCK_AMOUNT ?? item.AMOUNT ?? item.QUANTITY));
}

// v XML je PRICE cena BEZ DPH a PRICE_VAT s DPH (Shoptet i Heureka) – holé
// „price" tu tedy NEznamená cenu s DPH jako v CSV exportu
const XML_CANDIDATES: Partial<Record<FieldName, string[]>> = {
  ...CANDIDATES,
  price_vat: ["pricevat", "pricewithvat", "gprice", "cenasdph"],
  price: ["pricewithoutvat", "price", "cenabezdph"],
};

/** requireCode=false u rodiče s variantami – Shoptet tam kód často nemá
 *  (kód nese varianta), texty/obrázky/parametry ale ano */
function normalizeXmlItem(item: Obj, mapping: Record<string, string>, parent?: NormProduct, requireCode = true): NormProduct | null {
  const codeHit = pick(item, XML_CANDIDATES.code!);
  const code = str(codeHit?.value) ?? (requireCode ? null : str(text(item["@_id"])) ?? "");
  if (code === null) return null;
  if (codeHit) mapping.code ??= codeHit.key;
  const norm: NormProduct = parent
    ? { ...parent, images: [...parent.images], code, parent_code: parent.code }
    : { ...EMPTY_PRODUCT, images: [], code };
  for (const [field, cands] of Object.entries(XML_CANDIDATES) as [FieldName, string[]][]) {
    if (field === "code" || field === "parent_code") continue;
    const hit = pick(item, cands);
    if (hit) {
      mapping[field] ??= hit.key;
      const converted = convert(field, hit.value);
      if (converted !== null) (norm as Record<string, unknown>)[field] = converted;
    }
  }
  const stock = xmlStock(item);
  if (stock !== null) { norm.stock = stock; mapping.stock ??= "STOCK/AMOUNT"; }
  const cat = xmlCategory(item);
  if (cat) { norm.category = cat; mapping.category ??= "CATEGORIES/DEFAULT_CATEGORY"; }
  const imgs = xmlImages(item);
  if (imgs.length) { norm.images = imgs; norm.main_image = null; mapping.images ??= "IMAGES/IMAGE | IMGURL"; }
  xmlParams(item, norm);
  finalizePrices(norm);
  return norm;
}

export function parseShoptetXml(xml: string, encoding = "utf-8"): ParsedShoptet {
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true });
  const warnings: string[] = [];
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    return { format: "xml", encoding, rows: [], mapping: {}, unmapped_columns: [], skipped: 0, duplicates: 0,
      warnings: [`XML nejde načíst: ${(e as Error).message}`] };
  }
  const { path, items } = findItems(doc);
  const mapping: Record<string, string> = { _items: path };
  const byCode = new Map<string, { raw: ShoptetRow; norm: NormProduct }>();
  let skipped = 0;
  let duplicates = 0;
  const add = (raw: Obj, norm: NormProduct) => {
    const key = norm.code.toUpperCase();
    if (byCode.has(key)) duplicates++;
    byCode.set(key, { raw, norm });
  };
  for (const item of items) {
    const variants = asArray(((item.VARIANTS as Obj | undefined)?.VARIANT) as Obj | Obj[] | undefined);
    const base = normalizeXmlItem(item, mapping, undefined, variants.length === 0);
    if (variants.length) {
      // Shoptet: kód/EAN/cena/sklad nese varianta, texty rodič
      const parentNorm = base!;
      for (const v of variants) {
        const vn = normalizeXmlItem(v, mapping, parentNorm);
        if (vn) add({ ...item, VARIANTS: undefined, VARIANT: v }, vn); else skipped++;
      }
    } else if (base) add(item, base);
    else skipped++;
  }
  if (!items.length) warnings.push("v XML jsem nenašel seznam produktů (SHOPITEM / item)");
  if (duplicates) warnings.push(`${duplicates}× duplicitní kód – použil se poslední výskyt`);
  return { format: "xml", encoding, rows: [...byCode.values()], mapping, unmapped_columns: [], skipped, duplicates, warnings };
}

/** rozpozná formát podle obsahu a naparsuje */
export function parseShoptetFile(buf: Buffer, filename: string): ParsedShoptet {
  const { text, encoding } = decodeText(buf);
  const looksXml = /\.xml$/i.test(filename) || /^\s*<(\?xml|shop|rss|feed)/i.test(text.slice(0, 200));
  return looksXml ? parseShoptetXml(text, encoding) : parseShoptetCsv(text, encoding);
}
