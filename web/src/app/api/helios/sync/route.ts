// Ruční načtení dat z Helios API (plný snímek view).
//   POST /api/helios/sync
// Pozor: Helios API pouští jen povolené IP adresy – z Vercelu bez stálé IP
// vrátí chybu; pak použij import JSON exportu (/api/imports/helios).

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { heliosConfigured } from "@/lib/helios";
import { loadHelios } from "@/lib/helios-sync";
import { canSection, requestUser } from "@/lib/request-user";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request) || !canSection(request, "helios")) {
    return NextResponse.json({ error: "Nepřihlášen nebo bez práva na sekci Helios" }, { status: 401 });
  }
  if (!heliosConfigured()) {
    return NextResponse.json({ error: "Helios API není nastavené (HELIOS_API_URL + HELIOS_API_KEY ve Vercel env)" }, { status: 422 });
  }
  const result = await loadHelios(null, "api", requestUser(request));
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
