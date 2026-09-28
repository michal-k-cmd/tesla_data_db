// Vercel Cron (web/vercel.json, 1× denně): načte Helios z API.
// Běží jen s HELIOS_CRON_ENABLED=1 – dokud Helios API nepovolí IP, na které
// appka běží, by každý běh jen zapsal chybu do logu.

import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/auth";
import { heliosConfigured } from "@/lib/helios";
import { loadHelios } from "@/lib/helios-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (!checkCronSecret(request)) {
    return NextResponse.json({ error: "Neplatný CRON_SECRET" }, { status: 401 });
  }
  if (process.env.HELIOS_CRON_ENABLED !== "1" || !heliosConfigured()) {
    return NextResponse.json({ ok: true, skipped: "HELIOS_CRON_ENABLED není 1 nebo chybí Helios API env" });
  }
  const result = await loadHelios(null, "api", "cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
