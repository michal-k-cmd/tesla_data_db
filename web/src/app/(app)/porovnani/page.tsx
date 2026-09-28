import Link from "next/link";
import { requireSection } from "@/lib/session-server";
import { loadProducts } from "@/lib/products-store";
import { CellStatus, computeCompare, FIELDS, Master } from "@/lib/compare";
import { fmtDateTime, fmtNum, fmtValue, truncate } from "@/lib/format";

export const dynamic = "force-dynamic";

const PAGE = 100;
const STATUSES: { key: CellStatus | "all"; label: string }[] = [
  { key: "different", label: "liší se" },
  { key: "only_helios", label: "jen v Heliosu" },
  { key: "only_shoptet", label: "jen v e-shopu" },
  { key: "equal", label: "shoda" },
  { key: "all", label: "vše" },
];
const MASTER_LABEL: Record<Master, string> = { helios: "Helios", shoptet: "e-shop", rozhodnout: "rozhodnout" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection("compare");
  const sp = await searchParams;
  const vat = sp.vat === "with" ? "with" : "without";
  const [helios, shoptet] = await Promise.all([loadProducts("helios"), loadProducts("shoptet")]);

  if (helios.length === 0 || shoptet.length === 0) {
    return (
      <>
        <h1>Porovnání dat</h1>
        <div className="panel">
          <p>Pro porovnání jsou potřeba data z obou stran:</p>
          <ul>
            <li>Helios: {helios.length ? `${helios.length} produktů ✓` : <Link href="/helios">nahrát JSON export / načíst z API</Link>}</li>
            <li>E-shop: {shoptet.length ? `${shoptet.length} produktů ✓` : <Link href="/shoptet">nahrát export z Shoptetu</Link>}</li>
          </ul>
        </div>
      </>
    );
  }

  const result = computeCompare(helios, shoptet, { heliosPriceVat: vat });
  const field = FIELDS.find((f) => String(f.key) === sp.field) ?? null;
  const status = (sp.status ?? "different") as CellStatus | "all";
  const q = (sp.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const link = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const merged = { vat, field: field ? String(field.key) : null, status, q: sp.q ?? null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "vat" && v === "without")) params.set(k, v);
    return `/porovnani?${params}`;
  };

  let rows = result.pairs;
  if (field) rows = rows.filter((p) => status === "all" || p.cells[String(field.key)].status === status);
  else if (status === "different") rows = rows.filter((p) => p.diff_count > 0);
  if (q) rows = rows.filter((p) => [p.code, p.shoptet_code, p.name].some((v) => v && v.toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((Math.min(page, pages) - 1) * PAGE, Math.min(page, pages) * PAGE);
  const matched = result.matched_by_code + result.matched_by_ean;

  return (
    <>
      <h1>Porovnání dat</h1>
      <p className="subtitle">
        Helios {fmtDateTime(result.helios_synced_at)} × e-shop {fmtDateTime(result.shoptet_synced_at)}. Párování přes kód
        produktu (Helios RegCis = kód v e-shopu), zbytek přes EAN. Sloupec „navržený master" je jen návrh – synchronizaci
        pustíme, až ho u každého pole potvrdíte.
      </p>

      <div className="grid">
        <div className="card"><span className="num">{matched}</span><span className="label">spárováno ({result.matched_by_code} kód, {result.matched_by_ean} EAN)</span></div>
        <div className="card"><span className="num">{result.only_helios.length}</span><span className="label">jen v Heliosu</span></div>
        <div className="card"><span className="num">{result.only_shoptet.length}</span><span className="label">jen v e-shopu</span></div>
        <div className="card"><span className="num">{result.pairs.filter((p) => p.diff_count > 0).length}</span><span className="label">spárovaných s aspoň 1 rozdílem</span></div>
      </div>

      <div className="legend">
        Cena Heliosu (<code>cena_1</code>) se bere jako{" "}
        <strong>{vat === "with" ? "cena S DPH (přepočet na bez DPH)" : "cena BEZ DPH"}</strong> –{" "}
        <Link href={link({ vat: vat === "with" ? "without" : "with", page: null })}>přepnout</Link>.
        {result.price_ratio_median !== null && (
          <> Medián poměru Helios / e-shop s DPH je <strong>{fmtNum(result.price_ratio_median, 3)}</strong>
            {Math.abs(result.price_ratio_median - 1 / 1.21) < 0.03 ? " → cena_1 vypadá jako cena BEZ DPH." :
              Math.abs(result.price_ratio_median - 1) < 0.03 ? " → cena_1 vypadá jako cena S DPH." : " → ceny se výrazně liší, ověřit."}</>
        )}
      </div>

      <h2>Pole</h2>
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr>
              <th>pole</th><th className="num">shoda</th><th className="num">liší se</th><th className="num">jen Helios</th>
              <th className="num">jen e-shop</th><th className="num">prázdné</th><th>navržený master</th><th></th>
            </tr>
          </thead>
          <tbody>
            {result.fields.map((f) => (
              <tr key={f.key} style={field && String(field.key) === f.key ? { background: "var(--row-hover)" } : undefined}>
                <td><Link href={link({ field: f.key, status: "different", page: null })}>{f.label}</Link></td>
                <td className="num">{f.equal}</td>
                <td className={`num${f.different ? " diff-cell" : ""}`}>
                  <Link href={link({ field: f.key, status: "different", page: null })}>{f.different}</Link>
                </td>
                <td className={`num${f.only_helios ? " only-cell" : ""}`}>
                  <Link href={link({ field: f.key, status: "only_helios", page: null })}>{f.only_helios}</Link>
                </td>
                <td className={`num${f.only_shoptet ? " only-cell" : ""}`}>
                  <Link href={link({ field: f.key, status: "only_shoptet", page: null })}>{f.only_shoptet}</Link>
                </td>
                <td className="num muted">{f.both_empty}</td>
                <td>{MASTER_LABEL[f.master]}</td>
                <td className="nowrap"><a className="small" href={`/api/compare/export?field=${f.key}&status=different${vat === "with" ? "&vat=with" : ""}`}>CSV rozdílů</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted" style={{ marginBottom: 0 }}>
          <a href={`/api/compare/export?status=all${vat === "with" ? "&vat=with" : ""}`}>export všech polí všech spárovaných produktů (CSV)</a>
        </p>
      </div>

      <h2>{field ? `Produkty – ${field.label}` : "Produkty s rozdíly"}</h2>
      <div className="chips">
        {field && <Link className="chip" href={link({ field: null, status: "different", page: null })}>✕ všechna pole</Link>}
        {STATUSES.filter((s) => field || s.key === "different" || s.key === "all").map((s) => (
          <Link key={s.key} className={`chip${status === s.key ? " active" : ""}`} href={link({ status: s.key, page: null })}>{s.label}</Link>
        ))}
      </div>
      <form className="row" action="/porovnani">
        {vat === "with" && <input type="hidden" name="vat" value="with" />}
        {field && <input type="hidden" name="field" value={String(field.key)} />}
        <input type="hidden" name="status" value={status} />
        <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder="hledat kód nebo název" style={{ minWidth: 260 }} />
        <button type="submit" className="secondary">hledat</button>
        <span className="muted small">{rows.length} produktů</span>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            {field ? (
              <tr><th>kód</th><th>název</th><th>spárováno</th><th>Helios</th><th>e-shop</th></tr>
            ) : (
              <tr><th>kód</th><th>název</th><th>spárováno</th><th className="num">rozdílů</th><th>liší se v polích</th></tr>
            )}
          </thead>
          <tbody>
            {shown.map((p) => {
              if (field) {
                const cell = p.cells[String(field.key)];
                const isLong = field.kind === "html";
                return (
                  <tr key={p.code}>
                    <td className="nowrap"><code>{p.code}</code>{p.shoptet_code !== p.code && <div className="small muted">e-shop {p.shoptet_code}</div>}</td>
                    <td>{truncate(p.name ?? "–", 70)}</td>
                    <td className="small">{p.matched_by}</td>
                    <td className={cell.status === "different" ? "diff-cell" : cell.status === "only_helios" ? "only-cell" : undefined}>
                      {isLong ? truncate(fmtValue(cell.helios), 240) : fmtValue(cell.helios)}
                    </td>
                    <td className={cell.status === "different" ? "diff-cell" : cell.status === "only_shoptet" ? "only-cell" : undefined}>
                      {isLong ? truncate(fmtValue(cell.shoptet), 240) : fmtValue(cell.shoptet)}
                    </td>
                  </tr>
                );
              }
              const diffFields = FIELDS.filter((f) => p.cells[String(f.key)].status === "different");
              return (
                <tr key={p.code}>
                  <td className="nowrap"><code>{p.code}</code></td>
                  <td>{truncate(p.name ?? "–", 70)}</td>
                  <td className="small">{p.matched_by}</td>
                  <td className="num">{p.diff_count}</td>
                  <td className="small">
                    {diffFields.map((f, i) => (
                      <span key={String(f.key)}>{i > 0 && ", "}<Link href={link({ field: String(f.key), status: "different", q: p.code, page: null })}>{f.label}</Link></span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={5} className="muted">nic k zobrazení</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          {page > 1 && <Link className="chip" href={link({ page: String(page - 1) })}>← předchozí</Link>}
          <span className="muted">strana {Math.min(page, pages)} / {pages}</span>
          {page < pages && <Link className="chip" href={link({ page: String(page + 1) })}>další →</Link>}
        </div>
      )}

      <h2>Nespárované produkty</h2>
      <details className="panel">
        <summary>jen v Heliosu ({result.only_helios.length}) – v e-shopu chybí, nebo mají jiný kód i EAN</summary>
        <OnlyTable items={result.only_helios} />
      </details>
      <details className="panel">
        <summary>jen v e-shopu ({result.only_shoptet.length}) – v Heliosu chybí (nebo nemají příznak „zobrazeno na webu")</summary>
        <OnlyTable items={result.only_shoptet} />
      </details>
    </>
  );
}

function OnlyTable({ items }: { items: { code: string; name: string | null; ean: string | null }[] }) {
  if (!items.length) return <p className="muted small">žádné</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>kód</th><th>název</th><th>EAN</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.code}><td className="nowrap"><code>{i.code}</code></td><td>{truncate(i.name ?? "–", 90)}</td><td>{i.ean ?? "–"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
