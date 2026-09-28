// Odhlášení: zneplatní vinisto loginHash (best-effort) a smaže session cookie.

import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, getSession, isSameOrigin, logoutAgainstVinisto } from "@/lib/vinisto-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin požadavek odmítnut" }, { status: 403 });
  }
  const session = getSession(request);
  if (session) await logoutAgainstVinisto(session.loginHash);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
