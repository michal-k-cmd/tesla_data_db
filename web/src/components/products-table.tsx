import Link from "next/link";
import type { StoredProduct } from "@/lib/products-store";
import { fmtNum, truncate } from "@/lib/format";

const PAGE = 50;

/** Tabulka klonovaných produktů s hledáním a stránkováním přes searchParams. */
export function ProductsTable({
  products,
  basePath,
  q,
  page,
  priceLabel,
  priceOf,
}: {
  products: StoredProduct[];
  basePath: string;
  q: string;
  page: number;
  priceLabel: string;
  priceOf: (p: StoredProduct) => number | null;
}) {
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? products.filter((p) =>
        [p.norm.code, p.norm.name, p.norm.ean, p.norm.category].some((v) => v && String(v).toLowerCase().includes(needle)))
    : products;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(Math.max(1, page), pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const href = (p: number) => `${basePath}?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <form className="row" action={basePath}>
        <input type="search" name="q" defaultValue={q} placeholder="hledat kód, název, EAN, kategorii" style={{ minWidth: 280 }} />
        <button type="submit" className="secondary">hledat</button>
        <span className="muted small">{filtered.length} z {products.length}</span>
      </form>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>kód</th><th>název</th><th>EAN</th><th className="num">{priceLabel}</th>
              <th className="num">sklad</th><th>kategorie</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.code}>
                <td className="nowrap"><code>{p.norm.code}</code>{p.norm.parent_code ? <div className="small muted">var. {p.norm.parent_code}</div> : null}</td>
                <td>{truncate(p.norm.name ?? "–", 90)}</td>
                <td className="nowrap">{p.norm.ean ?? "–"}</td>
                <td className="num">{fmtNum(priceOf(p), 2)}</td>
                <td className="num">{fmtNum(p.norm.stock)}</td>
                <td className="small">{p.norm.category ?? "–"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">žádné produkty</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          {current > 1 && <Link className="chip" href={href(current - 1)}>← předchozí</Link>}
          <span className="muted">strana {current} / {pages}</span>
          {current < pages && <Link className="chip" href={href(current + 1)}>další →</Link>}
        </div>
      )}
    </>
  );
}
