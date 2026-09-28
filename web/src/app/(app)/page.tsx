import Link from "next/link";
import { requireSection } from "@/lib/session-server";
import { sourceStats } from "@/lib/products-store";
import { listRuns } from "@/lib/sync-runs";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireSection("dashboard");
  const [helios, shoptet, runs] = await Promise.all([sourceStats("helios"), sourceStats("shoptet"), listRuns(5)]);

  return (
    <>
      <h1>Přehled</h1>
      <p className="subtitle">
        TESLA lighting – klon dat z ERP Helios a z e-shopu. První krok: data porovnat a u každého pole rozhodnout, který
        zdroj je správný. Pak synchronizace ERP → e-shop.
      </p>

      <div className="grid">
        <Link href="/helios" className="card">
          <span className="num">{helios.count}</span>
          <span className="label">produktů z Heliosu</span>
          <span className="small muted">{helios.synced_at ? `${fmtDateTime(helios.synced_at)} · ${helios.origin}` : "zatím nenačteno"}</span>
        </Link>
        <Link href="/shoptet" className="card">
          <span className="num">{shoptet.count}</span>
          <span className="label">produktů z e-shopu</span>
          <span className="small muted">{shoptet.synced_at ? fmtDateTime(shoptet.synced_at) : "zatím nenačteno"}</span>
        </Link>
        <Link href="/porovnani" className="card">
          <span className="num">→</span>
          <span className="label">porovnání dat</span>
        </Link>
      </div>

      <h2>Postup</h2>
      <div className="panel">
        <ol>
          <li>Helios: načíst z API (až bude povolená IP), zatím nahrát JSON export – <Link href="/helios">Helios</Link>.</li>
          <li>E-shop: nahrát export produktů z administrace Shoptetu – <Link href="/shoptet">E-shop</Link>.</li>
          <li>Projít <Link href="/porovnani">porovnání</Link> a u každého pole potvrdit, který zdroj je master.</li>
          <li>Teprve potom synchronizace (ceny a sklad z Heliosu, obsah podle rozhodnutí).</li>
        </ol>
      </div>

      <h2>Poslední běhy</h2>
      <div className="table-wrap panel">
        <table>
          <thead><tr><th>kdy</th><th>zdroj</th><th>režim</th><th>stav</th><th className="num">řádků</th><th>kdo</th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.started_at)}</td>
                <td>{r.entity}</td>
                <td>{r.mode}</td>
                <td className={`status-${r.status === "ok" ? "ok" : r.status === "running" ? "running" : "error"}`}>{r.status}</td>
                <td className="num">{r.rows ?? "–"}</td>
                <td className="small">{r.created_by ?? "–"}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={6} className="muted">zatím žádné běhy</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
