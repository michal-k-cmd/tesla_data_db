// Inicializace / migrace schématu (idempotentní). Admin appky nebo ADMIN_TOKEN.
//   POST /api/init-db

import { NextRequest, NextResponse } from "next/server";
import { checkAppAdmin } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!checkAppAdmin(request)) {
    return NextResponse.json({ error: "Vyžadován admin appky" }, { status: 403 });
  }
  try {
    await getPool().query(SCHEMA_SQL);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
