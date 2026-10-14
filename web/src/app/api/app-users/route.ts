// Správa uživatelů appky a jejich práv na sekce (Nastavení → uživatelé a
// práva). Jen admin appky (superadmin platformy / app_users.is_admin /
// ADMIN_TOKEN).
//   GET    -> { users: [...], sections: [{key,label}] }
//   POST   { email, sections[], is_admin?, enabled?, note? }  (upsert)
//   DELETE { email }

import { NextRequest, NextResponse } from "next/server";
import { checkAppAdmin } from "@/lib/auth";
import { getSession } from "@/lib/vinisto-auth";
import { deleteAppUser, listAppUsers, upsertAppUser } from "@/lib/app-users";
import { APP_SECTIONS } from "@/config/app-sections";
import { logAccess } from "@/lib/access-log";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!checkAppAdmin(request)) {
    return NextResponse.json({ error: "Vyžadován admin appky" }, { status: 403 });
  }
  try {
    return NextResponse.json({ users: await listAppUsers(), sections: APP_SECTIONS });
  } catch (e) {
    if (/does not exist/.test(String(e))) {
      return NextResponse.json({ users: [], sections: APP_SECTIONS, note: "tabulka app_users neexistuje – spusť Inicializovat DB" });
    }
    throw e;
  }
}

export async function POST(request: NextRequest) {
  if (!checkAppAdmin(request)) {
    logAccess(request, "/api/app-users", 403, "unauthorized");
    return NextResponse.json({ error: "Vyžadován admin appky" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body?.email) return NextResponse.json({ error: "email je povinný" }, { status: 422 });
  const actor = getSession(request)?.email ?? "admin-token";
  try {
    const user = await upsertAppUser({
      email: String(body.email),
      sections: body.sections,
      is_admin: body.is_admin === true,
      enabled: body.enabled !== false,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    }, actor);
    logAccess(request, "/api/app-users", 200, "ok", `${actor} -> ${user.email}`);
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!checkAppAdmin(request)) {
    logAccess(request, "/api/app-users", 403, "unauthorized");
    return NextResponse.json({ error: "Vyžadován admin appky" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  if (!email) return NextResponse.json({ error: "email je povinný" }, { status: 422 });
  const deleted = await deleteAppUser(email);
  if (!deleted) return NextResponse.json({ error: "uživatel neexistuje" }, { status: 404 });
  logAccess(request, "/api/app-users", 200, "ok", `smazán ${email}`);
  return NextResponse.json({ ok: true });
}
