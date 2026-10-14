"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ImportResponse = {
  ok?: boolean;
  dry?: boolean;
  error?: string;
  rows?: number;
  format?: string;
  encoding?: string;
  skipped?: number;
  duplicates?: number;
  declared_count?: number | null;
  issues_count?: number;
  mapping?: Record<string, string>;
  unmapped_columns?: string[];
  warnings?: string[];
};

/** Nahrání souboru na importní endpoint; volitelně s náhledem mapování (dry). */
export function UploadForm({ url, accept, allowPreview }: { url: string; accept: string; allowPreview?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);

  async function send(dry: boolean) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch(`${url}${dry ? "?dry=1" : ""}`, { method: "POST", body: form });
      const data: ImportResponse = await res.json().catch(() => ({ error: `HTTP ${res.status} – odpověď není JSON` }));
      setResult(res.ok ? data : { ...data, ok: false, error: data.error ?? `HTTP ${res.status}` });
      if (res.ok && !dry) router.refresh();
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row">
        <input type="file" accept={accept} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        {allowPreview && (
          <button type="button" className="secondary" disabled={!file || busy} onClick={() => send(true)}>
            náhled mapování
          </button>
        )}
        <button type="button" disabled={!file || busy} onClick={() => send(false)}>
          {busy ? "nahrávám…" : "nahrát a nahradit data"}
        </button>
      </div>
      {result && (
        <div className={`msg ${result.ok === false ? "err" : "ok"}`}>
          {result.ok === false ? (
            <>chyba: {result.error}</>
          ) : (
            <>
              {result.dry ? "náhled" : "uloženo"}: {result.rows} produktů
              {result.format ? ` · ${result.format.toUpperCase()} ${result.encoding}` : ""}
              {result.declared_count ? ` · Helios hlásí ${result.declared_count}` : ""}
              {result.skipped ? ` · přeskočeno ${result.skipped}` : ""}
              {result.duplicates ? ` · duplicit ${result.duplicates}` : ""}
              {result.issues_count ? ` · ${result.issues_count} produktů s nálezem kvality dat` : ""}
            </>
          )}
        </div>
      )}
      {result?.warnings && result.warnings.length > 0 && (
        <ul className="msg err">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      {result?.mapping && (
        <details className="legend" open={result.dry}>
          <summary>mapování sloupců (pole → sloupec v souboru)</summary>
          <table>
            <tbody>
              {Object.entries(result.mapping).map(([k, v]) => (
                <tr key={k}><td className="nowrap"><code>{k}</code></td><td>{v}</td></tr>
              ))}
            </tbody>
          </table>
          {result.unmapped_columns && result.unmapped_columns.length > 0 && (
            <p className="small">nepoužité sloupce (uloží se jen do raw): {result.unmapped_columns.join(", ")}</p>
          )}
        </details>
      )}
    </div>
  );
}
