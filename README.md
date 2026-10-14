# tesla_data_db

Data TESLA lighting: klon ERP Helios a e-shopu, porovnání po polích a (v další
fázi) synchronizace ERP → e-shop. Admin appka v `web/` (Next.js, Vercel).

## Nasazení na Vercel

1. Project → Settings → General → **Root Directory = `web`** (framework Next.js).
2. Storage → připojit Postgres (Neon) – nastaví `POSTGRES_URL` samo.
3. Environment Variables (viz `web/.env.example`):
   - `VINISTO_API_BASE_URL=https://www.vinisto.cz`, `SESSION_SECRET` (`openssl rand -hex 32`)
   - `HELIOS_API_URL`, `HELIOS_API_KEY` (tajné), případně `HELIOS_TLS_INSECURE=1`
   - `CRON_SECRET` + `HELIOS_CRON_ENABLED=1`, až Helios povolí IP serveru
4. Deploy → přihlásit se superadmin účtem vinisto → Nastavení → **Inicializovat DB**.

## Použití

- **Helios** – načíst z API, nebo nahrát JSON export (skript od Helios podpory).
- **E-shop** – nahrát export produktů z administrace Shoptetu (CSV / XML);
  nejdřív „náhled mapování".
- **Porovnání** – počty shod/rozdílů po polích, proklik na produkty, export CSV.
- **Nastavení** – stav konfigurace, inicializace DB, uživatelé a práva.

Podrobnosti pro vývoj: [CLAUDE.md](CLAUDE.md).
