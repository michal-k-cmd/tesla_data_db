// Načtení Helios dat do klonu – z API nebo z nahraného JSON exportu.
// Sdílené pro ruční sync, import i cron.

import { fetchHeliosView, parseHeliosPayload } from "./helios";
import { replaceSnapshot } from "./products-store";
import { finishRun, startRun } from "./sync-runs";

export type HeliosLoadResult = {
  ok: boolean;
  rows: number;
  declared_count: number | null;
  skipped: number;
  duplicates: number;
  issues_count: number;
  error?: string;
};

export async function loadHelios(
  payload: unknown | null,
  mode: "api" | "import",
  createdBy: string | null,
  filename?: string,
): Promise<HeliosLoadResult> {
  const runId = await startRun("helios", mode, createdBy);
  try {
    const data = payload ?? (await fetchHeliosView());
    const parsed = parseHeliosPayload(data);
    if (parsed.rows.length === 0) {
      const error = "Helios nevrátil žádné produkty – stávající data se nemažou";
      await finishRun(runId, "error", 0, error, { filename });
      return { ok: false, rows: 0, declared_count: parsed.declared_count, skipped: parsed.skipped, duplicates: 0, issues_count: 0, error };
    }
    const rows = await replaceSnapshot("helios", parsed.rows, mode);
    const detail = {
      filename,
      declared_count: parsed.declared_count,
      skipped: parsed.skipped,
      duplicates: parsed.duplicates,
      issues_count: parsed.issues.length,
    };
    await finishRun(runId, "ok", rows, null, detail);
    return { ok: true, rows, ...detail, issues_count: parsed.issues.length };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finishRun(runId, "error", null, error, { filename });
    return { ok: false, rows: 0, declared_count: null, skipped: 0, duplicates: 0, issues_count: 0, error };
  }
}
