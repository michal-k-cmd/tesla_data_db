import { requireSection } from "@/lib/session-server";
import { loadProducts } from "@/lib/products-store";
import { listRuns } from "@/lib/sync-runs";
import { fmtDateTime } from "@/lib/format";
import { ProductsTable } from "@/components/products-table";
import { UploadForm } from "@/components/upload-form";

export const dynamic = "force-dynamic";

export default async function ShoptetPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSection("shoptet");
  const sp = await searchParams;
  const products = await loadProducts("shoptet");
  const lastRun = (await listRuns(1, "shoptet"))[0];
  const variants = products.filter((p) => p.norm.parent_code).length;

  return (
    <>
      <h1>E-shop (Shoptet)</h1>
      <p className="subtitle">
        Klon produktů z e-shopu <code>eshop.tesla-lighting.cz</code>. Zatím z exportu (CSV nebo XML); napojení přes
        Shoptet API doplníme, až bude API token.
      </p>

      <div className="grid">
        <div className="card"><span className="num">{products.length}</span><span className="label">produktů / variant v klonu</span></div>
        <div className="card"><span className="num">{variants}</span><span className="label">z toho variant</span></div>
        <div className="card">
          <span className="label">poslední import</span>
          <span>{fmtDateTime(lastRun?.finished_at ?? lastRun?.started_at)}</span>
          <span className={`small status-${lastRun?.status === "ok" ? "ok" : lastRun ? "error" : "skipped"}`}>
            {lastRun ? `${lastRun.status}${lastRun.error ? ` – ${lastRun.error.slice(0, 80)}` : ""}` : "zatím nic"}
          </span>
        </div>
      </div>

      <h2>Import exportu</h2>
      <div className="panel">
        <p className="muted small">
          V administraci Shoptetu: <strong>Produkty → Export</strong> (CSV, všechny sloupce), nebo XML export produktů.
          Nejdřív pusťte <strong>náhled mapování</strong> – ukáže, který sloupec souboru se použil pro které pole.
        </p>
        <UploadForm url="/api/imports/shoptet" accept=".csv,.xml,.txt,text/csv,text/xml,application/xml" allowPreview />
      </div>

      <h2>Produkty</h2>
      <ProductsTable products={products} basePath="/shoptet" q={sp.q ?? ""} page={Number(sp.page ?? 1)}
        priceLabel="cena s DPH" priceOf={(p) => p.norm.price_vat} />
    </>
  );
}
