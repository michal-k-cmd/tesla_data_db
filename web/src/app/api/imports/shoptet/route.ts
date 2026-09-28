// Import exportu produktů z e-shopu (Shoptet) – CSV nebo XML. Plný snímek.
//   POST /api/imports/shoptet   multipart/form-data, pole „file"
//   ?dry=1 → jen náhled mapování (nic se neukládá)

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { parseShoptetFile } from "@/lib/shoptet";
import { replaceSnapshot } from "@/lib/products-store";
import { finishRun, startRun } from "@/lib/sync-runs";
import { canSection, requestUser } from "@/lib/request-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request) || !canSection(request, "shoptet")) {
    return NextResponse.json({ error: "Nepřihlášen nebo bez práva na sekci E-shop" }, { status: 401 });
  }
  const dry = request.nextUrl.searchParams.get("dry") === "1";
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Chybí soubor (pole file)" }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Soubor je větší než ${MAX_BYTES / 1024 / 1024} MB – exportujte bez dlouhých popisů, nebo po částech` }, { status: 413 });
  }
  const parsed = parseShoptetFile(Buffer.from(await file.arrayBuffer()), file.name);
  const summary = {
    format: parsed.format,
    encoding: parsed.encoding,
    rows: parsed.rows.length,
    skipped: parsed.skipped,
    duplicates: parsed.duplicates,
    mapping: parsed.mapping,
    unmapped_columns: parsed.unmapped_columns,
    warnings: parsed.warnings,
    sample: parsed.rows.slice(0, 3).map((r) => r.norm),
  };
  if (dry) return NextResponse.json({ ok: true, dry: true, ...summary });

  const runId = await startRun("shoptet", "import", requestUser(request));
  if (parsed.rows.length === 0) {
    const error = parsed.warnings[0] ?? "v souboru nejsou žádné produkty";
    await finishRun(runId, "error", 0, error, { filename: file.name, ...summary, sample: undefined });
    return NextResponse.json({ ok: false, error, ...summary }, { status: 422 });
  }
  try {
    const rows = await replaceSnapshot("shoptet", parsed.rows, "import");
    await finishRun(runId, "ok", rows, null, { filename: file.name, ...summary, sample: undefined });
    return NextResponse.json({ ok: true, ...summary, rows });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await finishRun(runId, "error", null, error, { filename: file.name });
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
