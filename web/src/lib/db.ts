import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

/**
 * Connection string bere postupně z DATABASE_URL, POSTGRES_URL a
 * POSTGRES_URL_NON_POOLING – druhé dvě nastavuje Vercel Postgres/Neon
 * integrace automaticky, takže na Vercelu není potřeba nic ručně kopírovat.
 */
export function getConnectionString(): string {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    throw new Error("Chybí DATABASE_URL (ani POSTGRES_URL z Vercel integrace)");
  }
  return connectionString;
}

export function getPool(): Pool {
  if (!global._pgPool) {
    const connectionString = getConnectionString();
    global._pgPool = new Pool({
      connectionString,
      max: 3,
      // Managed Postgres (Neon, Supabase, RDS…) vyžaduje TLS; sslmode=require
      // v URL zapne TLS bez ověřování CA (self-signed certy poskytovatelů).
      ssl: /sslmode=(require|verify)/.test(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return global._pgPool;
}
