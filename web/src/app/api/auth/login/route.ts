// Přihlášení do admin aplikace proti vinisto.cz.
//   POST /api/auth/login { email, password }
// Heslo se nikam neukládá ani neloguje – jen se přepošle na vinisto Login.

import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin, loginAgainstVinisto, logoutAgainstVinisto, setSessionCookie } from "@/lib/vinisto-auth";
import { getAppUser } from "@/lib/app-users";
import { logAccess } from "@/lib/access-log";
import { clearLoginFailures, isLoginRateLimited, recordLoginFailure } from "@/lib/login-rate-limit";

export const dynamic = "force-dynamic";
const LOGIN_PATH = "/api/auth/login (přihlášení do appky)";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin požadavek odmítnut" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Vyplňte e-mail a heslo" }, { status: 400 });
  }

  // rate limit proti hádání hesel (per IP i per e-mail, okno 15 min)
  if (await isLoginRateLimited(request.headers, email)) {
    logAccess(request, LOGIN_PATH, 429, "unauthorized", email);
    return NextResponse.json(
      { error: "Příliš mnoho pokusů o přihlášení. Zkuste to za 15 minut." },
      { status: 429 },
    );
  }

  // superadmin gate se řeší TADY (ne v lib): superadmin platformy má vždy
  // vše, ostatní musí být v app_users (Nastavení -> uživatelé a práva)
  const result = await loginAgainstVinisto(email, password, { requireSuperAdmin: false });

  if (!result.ok) {
    if (result.reason === "bad_credentials") {
      await recordLoginFailure(request.headers, email);
      logAccess(request, LOGIN_PATH, 401, "unauthorized", email);
      // malé zpomalení proti hádání hesel
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return NextResponse.json({ error: "Nesprávný e-mail nebo heslo" }, { status: 401 });
    }
    if (result.reason === "forbidden") {
      logAccess(request, LOGIN_PATH, 403, "unauthorized", email);
      return NextResponse.json(
        { error: "nemáte práva pro přístup do této aplikace – požádejte správce o přidání v Nastavení" },
        { status: 403 },
      );
    }
    logAccess(request, LOGIN_PATH, 502, "error", email);
    return NextResponse.json(
      { error: `Přihlášení momentálně není dostupné (${result.detail})` },
      { status: 502 },
    );
  }

  const { session } = result;

  // práva na sekce: superadmin = vše; jinak dle app_users (fail-closed)
  if (session.isSuperAdmin) {
    session.sections = ["*"];
    session.isAppAdmin = true;
  } else {
    const appUser = await getAppUser(session.email);
    if (!appUser || appUser.sections.length === 0) {
      void logoutAgainstVinisto(session.loginHash);
      logAccess(request, LOGIN_PATH, 403, "unauthorized", email);
      return NextResponse.json(
        { error: "nemáte práva pro přístup do této aplikace – požádejte správce o přidání v Nastavení" },
        { status: 403 },
      );
    }
    session.sections = appUser.sections;
    session.isAppAdmin = appUser.is_admin;
  }
  session.appAccess = true;

  await clearLoginFailures(session.email);
  logAccess(request, LOGIN_PATH, 200, "ok", session.email);
  const response = NextResponse.json({
    email: session.email,
    permissions: session.permissions,
    isSuperAdmin: session.isSuperAdmin,
    sections: session.sections,
    isAppAdmin: session.isAppAdmin,
    expiresAt: session.expiresAt,
  });
  setSessionCookie(response, session);
  return response;
}
