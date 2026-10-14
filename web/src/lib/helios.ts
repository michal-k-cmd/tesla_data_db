// Konektor na Helios (TESLA LIGHTING s.r.o.) přes BI connector / API server
// od FWG atlantiso (Dominika Pillerová). Kontrakt z přiloženého .bat:
//   GET  {HELIOS_API_URL}/{view}          → { count, data: [...] }
//   GET/POST s JSON tělem {"sloupec":"hodnota"} → filtrovaný výsledek
//   hlavička X-API-Key: {HELIOS_API_KEY}
// Přístup je navíc omezený na POVOLENÉ IP adresy – z Vercelu (bez stálé IP)
// se API nejspíš nedovolá; pak se data nahrají importem JSON exportu
// (stejný tvar odpovědi, stáhnutý jejich .bat skriptem).

import https from "node:https";
import { heliosIssues, normalizeHelios, NormProduct, HeliosRow } from "./normalize";

export const HELIOS_DEFAULT_VIEW = "hvw_api_eshop_produkty_basic";
const TIMEOUT_MS = 60_000;

export function heliosConfigured(): boolean {
  return Boolean(process.env.HELIOS_API_URL && process.env.HELIOS_API_KEY);
}

export function heliosView(): string {
  return process.env.HELIOS_VIEW || HELIOS_DEFAULT_VIEW;
}

export type ParsedHelios = {
  rows: { raw: HeliosRow; norm: NormProduct }[];
  declared_count: number | null;
  skipped: number;
  duplicates: number;
  issues: { code: string; issues: string[] }[];
};

/** odpověď view → normalizované řádky (duplicitní RegCis = poslední výskyt) */
export function parseHeliosPayload(payload: unknown): ParsedHelios {
  const obj = payload as { count?: unknown; data?: unknown } | unknown[];
  const list = Array.isArray(obj) ? obj : Array.isArray((obj as { data?: unknown })?.data) ? (obj as { data: unknown[] }).data : null;
  if (!list) throw new Error("neočekávaný tvar dat z Heliosu (čekám { count, data: [...] })");
  const byCode = new Map<string, { raw: HeliosRow; norm: NormProduct }>();
  const issues: { code: string; issues: string[] }[] = [];
  let skipped = 0;
  let duplicates = 0;
  for (const item of list) {
    if (!item || typeof item !== "object") { skipped++; continue; }
    const raw = item as HeliosRow;
    const norm = normalizeHelios(raw);
    if (!norm) { skipped++; continue; }
    const key = norm.code.toUpperCase();
    if (byCode.has(key)) duplicates++;
    byCode.set(key, { raw, norm });
    const found = heliosIssues(raw);
    if (found.length) issues.push({ code: norm.code, issues: found });
  }
  const declared = Array.isArray(obj) ? null : Number((obj as { count?: unknown }).count);
  return {
    rows: [...byCode.values()],
    declared_count: Number.isFinite(declared) ? declared : null,
    skipped,
    duplicates,
    issues,
  };
}

/** GET view z Helios API. HELIOS_TLS_INSECURE=1 vypne ověření certifikátu
 *  (jejich .bat volá curl -k) – jen když server nemá platný certifikát. */
export async function fetchHeliosView(filter?: Record<string, unknown>): Promise<unknown> {
  const base = (process.env.HELIOS_API_URL || "").replace(/\/$/, "");
  const key = process.env.HELIOS_API_KEY || "";
  if (!base || !key) throw new Error("chybí HELIOS_API_URL / HELIOS_API_KEY");
  const url = new URL(`${base}/${encodeURIComponent(heliosView())}`);
  const body = filter && Object.keys(filter).length ? JSON.stringify(filter) : undefined;
  const insecure = process.env.HELIOS_TLS_INSECURE === "1";

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: body ? "POST" : "GET",
        headers: {
          "X-API-Key": key,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
        },
        rejectUnauthorized: !insecure,
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8").replace(/^﻿/, "");
          if ((res.statusCode ?? 0) !== 200) {
            const hint = res.statusCode === 403 || res.statusCode === 401
              ? " – nejspíš nepovolená IP adresa nebo neplatný klíč (IP povoluje Helios podpora)"
              : "";
            reject(new Error(`Helios API HTTP ${res.statusCode}${hint}: ${text.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`Helios API nevrátilo JSON: ${text.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Helios API neodpovědělo do ${TIMEOUT_MS / 1000} s – server nedostupný nebo IP není povolená`)));
    req.on("error", (e) => reject(new Error(`Helios API nedostupné: ${e.message}`)));
    if (body) req.write(body);
    req.end();
  });
}
