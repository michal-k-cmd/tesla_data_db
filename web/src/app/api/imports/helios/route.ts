// Import JSON exportu z Heliosu (stažený jejich .bat skriptem – stejný tvar
// jako odpověď API: { count, data: [...] }). Plný snímek.
//   POST /api/imports/helios   multipart/form-data, pole „file"

import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { loadHelios } from "@/lib/helios-sync";
import { canSection, requestUser } from "@/lib/request-user";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // limit těla requestu na Vercelu ~4,5 MB

export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request) || !canSection(request, "helios")) {
    return NextResponse.json({ error: "Nepřihlášen nebo bez práva na sekci Helios" }, { status: 401 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Chybí soubor (pole file)" }, { status: 422 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Soubor je větší než ${MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
  }
  let payload: unknown;
  try {
    const text = Buffer.from(await file.arrayBuffer()).toString("utf8").replace(/^﻿/, "");
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Soubor není platný JSON" }, { status: 422 });
  }
  const result = await loadHelios(payload, "import", requestUser(request), file.name);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
