import { requireSection } from "@/lib/session-server";
import { loadProducts } from "@/lib/products-store";
import { listEgressHistory, listRuns } from "@/lib/sync-runs";
import { heliosConfigured, heliosView } from "@/lib/helios";
import { heliosIssues } from "@/lib/normalize";
import { fmtDateTime } from "@/lib/format";
import { ActionButton } from "@/components/action-button";
import { EgressCheck } from "@/components/egress-check";
import { ProductsTable } from "@/components/products-table";
import { UploadForm } from "@/components/upload-form";

export const dynamic = "force-dynamic";

export default async function HeliosPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection("helios");
  const sp = await searchParams;
  const products = await loadProducts("helios");
  const lastRun = (await listRuns(1, "helios"))[0];
  const configured = heliosConfigured();
  const egress = await listEgressHistory(20);

  // kvalita dat uvnitř Heliosu – počítá se z raw při zobrazení
  const issueCounts = new Map<string, number>();
  for (const p of products) {
    for (const issue of heliosIssues(p.raw)) {
      const key = issue.replace(/\(.*\)|„.*"/g, "").trim();
      issueCounts.set(key, (issueCounts.get(key) ?? 0) + 1);
    }
  }
  const zeroStock = products.filter((p) => !p.norm.stock).length;

  return (
    <>
      <h1>Helios (ERP)</h1>
      <p className="subtitle">
        Klon view <code>{heliosView()}</code> – produkty s příznakem „zobrazeno na webu", sklad 00100001, cena z cenové
        úrovně 1. Každé načtení nahradí celý snímek.
      </p>

      <div className="grid">
        <div className="card"><span className="num">{products.length}</span><span className="label">produktů v klonu</span></div>
        <div className="card"><span className="num">{zeroStock}</span><span className="label">se skladem 0</span></div>
        <div className="card">
          <span className="label">poslední načtení</span>
          <span>{fmtDateTime(lastRun?.finished_at ?? lastRun?.started_at)}</span>
          <span className={`small status-${lastRun?.status === "ok" ? "ok" : lastRun ? "error" : "skipped"}`}>
            {lastRun ? `${lastRun.mode} · ${lastRun.status}${lastRun.error ? ` – ${lastRun.error.slice(0, 80)}` : ""}` : "zatím nic"}
          </span>
        </div>
      </div>

      <h2>Načtení dat</h2>
      <div className="panel">
        <h3>Z Helios API</h3>
        {configured ? (
          <ActionButton url="/api/helios/sync" label="načíst z Helios API" />
        ) : (
          <p className="muted small">Helios API není nastavené – chybí <code>HELIOS_API_URL</code> a <code>HELIOS_API_KEY</code> ve Vercel env.</p>
        )}
        <p className="muted small">
          API pouští jen povolené IP adresy. Dokud Helios nepovolí adresu serveru, na kterém appka běží, použijte import
          JSON exportu níže.
        </p>
        <h3>Odchozí IP (pro whitelist Helios API)</h3>
        <p className="muted small">
          Appka volá Helios z IP adresy serveru, na kterém běží. Na Vercelu se tato adresa mezi běhy mění (sdílený pool
          poskytovatele), a DNS název pro odchozí volání neexistuje – whitelist na straně Heliosu je jen podle IP.
          Každé volání API zapisuje IP do logu; tady je přehled.
        </p>
        <EgressCheck />
        {egress.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead><tr><th>IP</th><th>region</th><th className="num">volání</th><th>naposledy</th><th>poslední stav</th></tr></thead>
              <tbody>
                {egress.map((e) => (
                  <tr key={e.ip}>
                    <td><code>{e.ip}</code></td>
                    <td>{e.region ?? "–"}</td>
                    <td className="num">{e.calls}</td>
                    <td className="nowrap">{fmtDateTime(e.last_at)}</td>
                    <td className={e.last_status === "ok" ? "status-ok" : "status-error"}>{e.last_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3>Import JSON exportu</h3>
        <p className="muted small">Soubor stažený skriptem od Helios podpory (<code>{"{ count, data: [...] }"}</code>).</p>
        <UploadForm url="/api/imports/helios" accept=".json,application/json" />
      </div>

      {issueCounts.size > 0 && (
        <>
          <h2>Kvalita dat v Heliosu</h2>
          <div className="panel">
            <table>
              <thead><tr><th>nález</th><th className="num">produktů</th></tr></thead>
              <tbody>
                {[...issueCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="num">{v}</td></tr>
                ))}
              </tbody>
            </table>
            {zeroStock > products.length * 0.8 && (
              <p className="msg err">
                Většina produktů má sklad 0 – ověřit s Helios podporou, jestli view čte správný sklad (00100001)
                a jestli jsou stavy aktuální.
              </p>
            )}
          </div>
        </>
      )}

      <h2>Produkty</h2>
      <ProductsTable products={products} basePath="/helios" q={sp.q ?? ""} page={Number(sp.page ?? 1)}
        priceLabel="cena_1" priceOf={(p) => p.norm.price} />
    </>
  );
}
