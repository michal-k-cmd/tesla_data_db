// Informace o přihlášeném uživateli (pro dashboard).
//   GET /api/auth/me -> 200 {email, permissions, ...} | 401

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/vinisto-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Nepřihlášen" }, { status: 401 });
  }
  return NextResponse.json({
    email: session.email,
    permissions: session.permissions,
    isSuperAdmin: session.isSuperAdmin,
    sections: session.sections ?? (session.isSuperAdmin ? ["*"] : []),
    isAppAdmin: session.isAppAdmin ?? session.isSuperAdmin === true,
    expiresAt: session.expiresAt,
  });
}
