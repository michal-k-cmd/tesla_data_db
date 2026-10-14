// Z jaké IP appka právě volá ven (kvůli IP whitelistu Helios API).
//   GET  /api/helios/egress → { ip, region }  (jen zjištění)
//   POST /api/helios/egress → zjištění + zápis do logu (sync_runs entity helios_egress),
//        ať je vidět historie IP adres, které se na Vercelu střídají.

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { getEgressInfo } from "@/lib/egress";
import { finishRun, startRun } from "@/lib/sync-runs";
import { canSection, requestUser } from "@/lib/request-user";

export const dynamic = "force-dynamic";

function allowed(request: NextRequest): boolean {
  return checkAdminAuth(request) && (canSection(request, "helios") || canSection(request, "settings"));
}

export async function GET(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Nepřihlášen nebo bez práva" }, { status: 401 });
  return NextResponse.json(await getEgressInfo());
}

export async function POST(request: NextRequest) {
  if (!allowed(request)) return NextResponse.json({ error: "Nepřihlášen nebo bez práva" }, { status: 401 });
  const info = await getEgressInfo();
  const runId = await startRun("helios_egress", "check", requestUser(request));
  await finishRun(runId, info.ip ? "ok" : "error", null, info.error ?? null, { egress: info });
  return NextResponse.json({ ok: Boolean(info.ip), ...info });
}
