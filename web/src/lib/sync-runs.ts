import { getPool } from "./db";

// Log běhů (sync_runs) – každý import/sync se zapíše, i neúspěšný.

export async function startRun(entity: string, mode: string, createdBy: string | null): Promise<number | null> {
  try {
    const { rows } = await getPool().query(
      "INSERT INTO sync_runs (entity, mode, created_by) VALUES ($1, $2, $3) RETURNING id",
      [entity, mode, createdBy],
    );
    return Number(rows[0].id);
  } catch {
    return null;
  }
}

export async function finishRun(
  id: number | null,
  status: "ok" | "error" | "skipped",
  rows: number | null,
  error: string | null,
  detail?: unknown,
): Promise<void> {
  if (id === null) return;
  await getPool()
    .query(
      `UPDATE sync_runs SET status = $2, rows = $3, error = $4, detail = $5, finished_at = now() WHERE id = $1`,
      [id, status, rows, error ? error.slice(0, 2000) : null, detail === undefined ? null : JSON.stringify(detail)],
    )
    .catch(() => {});
}

export type SyncRun = {
  id: number;
  entity: string;
  mode: string;
  status: string;
  rows: number | null;
  error: string | null;
  detail: unknown;
  created_by: string | null;
  started_at: string;
  finished_at: string | null;
};

export async function listRuns(limit = 100, entity?: string): Promise<SyncRun[]> {
  try {
    const { rows } = await getPool().query(
      `SELECT id, entity, mode, status, rows, error, detail, created_by, started_at, finished_at
       FROM sync_runs WHERE ($2::text IS NULL OR entity = $2) ORDER BY started_at DESC LIMIT $1`,
      [limit, entity ?? null],
    );
    return rows;
  } catch {
    return [];
  }
}
