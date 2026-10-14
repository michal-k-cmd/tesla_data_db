# tesla_data_db – kontext projektu

Datová appka pro **TESLA lighting s.r.o.** (licence na jméno TESLA pro osvětlení).
Klonuje data z ERP **Helios** (Asseco Helios Inuvio, instance TESLA LIGHTING /
Helios3003, přístup přes BI connector od FWG atlantiso) a z **e-shopu**
(Shoptet, `eshop.tesla-lighting.cz`), porovná je a později bude synchronizovat
ERP → e-shop. Struktura podle `michal-k-cmd/vinisto_data_db` (Next.js admin
v `web/`, Postgres, sync_runs/sync_settings, přihlášení přes vinisto platformu
+ app_users, merkatos patička).

## Fáze

1. **(hotovo) klon + porovnání** – Helios z API / JSON exportu, e-shop z exportu
   CSV/XML, porovnání po polích s návrhem, který zdroj je „master".
2. **(další)** potvrdit master per pole (uložit do `sync_settings`), napojit
   Shoptet API (token), synchronizace ceny + skladu z Heliosu do e-shopu.

## Architektura

| Cesta | Co to je |
|---|---|
| `web/` | Next.js 15 (App Router, TS), deploy na Vercel – **Root Directory = `web`** |
| `web/src/lib/schema.ts` | schéma DB (idempotentní), tlačítko „Inicializovat DB" v Nastavení |
| `db/init/01_schema.sql` | stejné schéma pro ruční init – **musí zůstat v souladu se schema.ts** |
| `web/src/lib/helios.ts` | konektor Helios API + parser odpovědi view |
| `web/src/lib/shoptet.ts` | parser exportu e-shopu (CSV / XML Shoptet / Heureka) |
| `web/src/lib/normalize.ts` | sjednocený tvar produktu (`NormProduct`) + převody hodnot |
| `web/src/lib/compare.ts` | porovnání po polích (`FIELDS` = pole + navržený master) |

## Helios API (kontrakt z .bat od Helios podpory, 08/2026)

- `GET {HELIOS_API_URL}/{view}` → `{ count, data: [...] }`; view
  `hvw_api_eshop_produkty_basic` (sloupce = sestava kmenových karet
  „eshop_export_kompletni_v1"; SQL: TabKmenZbozi + _EXT + TabCisOrg +
  TabStavSkladu sklad `00100001`, cena z TabNC cenová úroveň 1, filtr
  `_tabkmenzbozi_parametry_zobrazeno_web = 1`).
- Filtr: GET nebo POST s JSON tělem `{"sloupec":"hodnota"}`; PUT = insert (nepoužíváme).
- Auth hlavička **`X-API-Key`** (ne Bearer). Klíč JEN ve Vercel env `HELIOS_API_KEY`.
- **IP whitelist** na straně Helios serveru – Vercel nemá stálou IP → z produkce
  se API nedovolá, dokud se nevyřeší (stálá IP / proxy ve firemní síti). Do té
  doby import JSON exportu (Helios → Import JSON), tvar stejný jako odpověď API.
- **Odchozí IP se loguje** u každého volání API (`sync_runs.detail.egress` {ip, region},
  `web/src/lib/egress.ts` přes api.ipify.org) + tlačítko „zjistit odchozí IP" a přehled
  IP na stránce Helios (`/api/helios/egress`). Na Vercelu se odchozí IP mezi běhy mění,
  DNS pro odchozí volání neexistuje – whitelist je jen podle IP.
- Jejich skript volá `curl -k` → `HELIOS_TLS_INSECURE=1` vypne ověření certifikátu.
- Nálezy ve vzorku dat (315 produktů): `MnozstviDispo` = 0 u 308 produktů
  a `JizNaSklade` vždy true (ověřit sklad s podporou); `cena_1` podle poměru
  vůči e-shopu nejspíš BEZ DPH (porovnání to počítá – medián poměru);
  nejednotné zápisy (ANO/Ne/ne, záruka „3 roky" vs. „24"), zdvojené parametry
  `imgbb_*` vs. `parametry_*` (příkon se liší u 9 produktů).

## E-shop (Shoptet)

- Zatím jen **import exportu** (CSV z Produkty → Export, nebo XML). Mapování
  sloupců je defenzivní (kandidáti názvů přes `fieldKey`, parametry přes
  `PARAM_RULES`) a import vrací, co se na co namapovalo – po 1. reálném
  exportu zkontrolovat v „náhled mapování".
- CSV: holé `price` = cena **s DPH** (Shoptet zadává ceny s DPH) – ověřit.
  XML: `PRICE` = bez DPH, `PRICE_VAT` = s DPH. Kódování UTF-8 i Windows-1250.
- Shoptet API (token `Shoptet-Private-API-Token`, placený doplněk) – napojit,
  až bude token; kontrakt ověřit proti dokumentaci, ne z paměti.
- Varianty = samostatné řádky (kód varianty), rodič v `norm.parent_code`.

## Data a bezpečnost

- Každé načtení = **plný snímek** (DELETE + INSERT v transakci); prázdný
  výsledek data nemaže. `raw` = kompletní zdrojový záznam, `norm` = sjednocený.
- **Repo je veřejné** – žádné exporty, klíče ani .bat do repa (`.gitignore`
  má `data/` a `*.bat`). Klíče jen ve Vercel env.
- Přihlášení: účty vinisto platformy (`web/src/lib/vinisto-auth.ts`, převzato
  z vinisto_data_db). Superadmin = vše, ostatní jen když je superadmin přidá
  v Nastavení → uživatelé a práva (tabulka `app_users`, sekce z
  `web/src/config/app-sections.ts`).
- `/api/compare` a export: session s právem „Porovnání", nebo `x-api-key` z
  `DATA_API_KEYS` / `ADMIN_TOKEN`.

## Konvence

- UI i texty česky; komponenty jsou server components, `"use client"` jen kde
  je interaktivita (formuláře, tlačítka, menu).
- Barvy přes tokeny v `web/src/app/globals.css`. Hlavička TESLA lighting je
  dočasná (brand manuál zatím nemáme – repo TESLA_WEB je prázdné), patička
  merkatos stejná jako ve vinisto data DB.
- Nové pole k porovnání = doplnit `NormProduct` (normalize.ts), mapování
  v helios/shoptet a řádek do `FIELDS` (compare.ts).

## Před commitem

```bash
cd web && npm run typecheck && npm run build
```

## Jak testovat lokálně

Postgres (lokálně nebo Neon), env podle `web/.env.example`, `npm run build &&
npm start`, přihlásit se superadmin účtem vinisto (nebo mock `PUT
/user-api/users/auth/Login` přes `VINISTO_API_BASE_URL`), Nastavení →
Inicializovat DB, nahrát JSON z Heliosu a export z Shoptetu, otevřít Porovnání.
