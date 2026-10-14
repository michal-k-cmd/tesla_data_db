-- Schéma tesla data DB (kopie web/src/lib/schema.ts – musí zůstat v souladu).
-- Na Vercelu stačí tlačítko „Inicializovat DB" v Nastavení; tento soubor je pro ruční init.
CREATE TABLE IF NOT EXISTS sync_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- log běhů synchronizací a importů (zdroj helios/shoptet, režim api/import)
CREATE TABLE IF NOT EXISTS sync_runs (
  id          BIGSERIAL PRIMARY KEY,
  entity      TEXT NOT NULL,
  mode        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'running',
  rows        INTEGER,
  error       TEXT,
  detail      JSONB,
  created_by  TEXT,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs (started_at DESC);

CREATE TABLE IF NOT EXISTS app_users (
  email      TEXT PRIMARY KEY,
  sections   JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  enabled    BOOLEAN NOT NULL DEFAULT true,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS access_log (
  id           BIGSERIAL PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  method       TEXT,
  path         TEXT,
  status       INTEGER,
  outcome      TEXT,
  api_key_hint TEXT,
  identity     TEXT,
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_access_log_at ON access_log (at DESC);

-- klon Helios view (hvw_api_eshop_produkty_basic): plný snímek per načtení.
-- raw = kompletní záznam z API, norm = sjednocený tvar pro porovnání.
CREATE TABLE IF NOT EXISTS helios_products (
  code       TEXT PRIMARY KEY,
  name       TEXT,
  ean        TEXT,
  price      NUMERIC,
  stock      NUMERIC,
  raw        JSONB NOT NULL,
  norm       JSONB NOT NULL,
  source     TEXT NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_helios_products_ean ON helios_products (ean);

-- klon produktů e-shopu (Shoptet) z exportu CSV/XML: plný snímek per import.
-- Varianty jsou samostatné řádky (kód varianty), rodič v norm.parent_code.
CREATE TABLE IF NOT EXISTS shoptet_products (
  code       TEXT PRIMARY KEY,
  name       TEXT,
  ean        TEXT,
  price_vat  NUMERIC,
  stock      NUMERIC,
  raw        JSONB NOT NULL,
  norm       JSONB NOT NULL,
  source     TEXT NOT NULL,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shoptet_products_ean ON shoptet_products (ean);
