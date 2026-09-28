import { requireSection } from "@/lib/session-server";
import { APP_SECTIONS } from "@/config/app-sections";
import { heliosConfigured, heliosView } from "@/lib/helios";
import { ActionButton } from "@/components/action-button";
import { UsersPanel } from "./users-panel";

export const dynamic = "force-dynamic";

function flag(ok: boolean) {
  return <span className={ok ? "status-ok" : "status-error"}>{ok ? "nastaveno" : "chybí"}</span>;
}

export default async function SettingsPage() {
  const session = await requireSection("settings");
  const isAdmin = session.isSuperAdmin === true || session.isAppAdmin === true;
  const env = process.env;

  return (
    <>
      <h1>Nastavení</h1>

      <h2>Konfigurace (Vercel env)</h2>
      <div className="panel table-wrap">
        <table>
          <tbody>
            <tr><td>databáze</td><td><code>DATABASE_URL</code> / <code>POSTGRES_URL</code></td><td>{flag(Boolean(env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING))}</td></tr>
            <tr><td>přihlašování</td><td><code>VINISTO_API_BASE_URL</code>, <code>SESSION_SECRET</code></td><td>{flag(Boolean(env.VINISTO_API_BASE_URL && env.SESSION_SECRET))}</td></tr>
            <tr><td>Helios API</td><td><code>HELIOS_API_URL</code>, <code>HELIOS_API_KEY</code> (view <code>{heliosView()}</code>)</td><td>{flag(heliosConfigured())}</td></tr>
            <tr><td>Helios denní načtení</td><td><code>HELIOS_CRON_ENABLED=1</code> + <code>CRON_SECRET</code></td><td>{flag(env.HELIOS_CRON_ENABLED === "1" && Boolean(env.CRON_SECRET))}</td></tr>
          </tbody>
        </table>
        <p className="small muted">Hodnoty klíčů se tu nikdy nezobrazují. Mění se ve Vercelu (Settings → Environment Variables) a po změně je potřeba redeploy.</p>
      </div>

      {isAdmin && (
        <>
          <h2>Databáze</h2>
          <div className="panel">
            <p className="small muted">Založí nebo doplní tabulky (idempotentní – data nemaže). Po prvním nasazení a po přidání tabulek.</p>
            <ActionButton url="/api/init-db" label="Inicializovat DB" secondary />
          </div>

          <h2>Uživatelé a práva</h2>
          <div className="panel">
            <p className="small muted">
              Přihlášení běží přes účty vinisto platformy. Superadmin má vždy přístup všude; ostatní uživatele sem přidá
              správce – e-mail musí odpovídat účtu na platformě.
            </p>
            <UsersPanel sections={APP_SECTIONS.map(({ key, label }) => ({ key, label }))} />
          </div>
        </>
      )}
    </>
  );
}
