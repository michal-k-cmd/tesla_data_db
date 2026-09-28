import { requireSection } from "@/lib/session-server";
import { listRuns } from "@/lib/sync-runs";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  await requireSection("logs");
  const runs = await listRuns(200);
  return (
    <>
      <h1>Logy</h1>
      <p className="subtitle">Posledních 200 načtení a importů (Helios API, importy souborů, cron).</p>
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr><th>začátek</th><th>konec</th><th>zdroj</th><th>režim</th><th>stav</th><th className="num">řádků</th><th>kdo</th><th>chyba / detail</th></tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{fmtDateTime(r.started_at)}</td>
                <td className="nowrap">{fmtDateTime(r.finished_at)}</td>
                <td>{r.entity}</td>
                <td>{r.mode}</td>
                <td className={`status-${r.status === "ok" ? "ok" : r.status === "running" ? "running" : "error"}`}>{r.status}</td>
                <td className="num">{r.rows ?? "–"}</td>
                <td className="small">{r.created_by ?? "–"}</td>
                <td className="small">
                  {r.error && <div className="status-error">{r.error}</div>}
                  {r.detail ? (
                    <details><summary>detail</summary><pre className="small" style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(r.detail, null, 2)}</pre></details>
                  ) : null}
                </td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={8} className="muted">zatím žádné běhy (nebo DB není inicializovaná)</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
