// Tenká auth vrstva nad vinisto platformou – PŘENOSITELNÝ MODUL.
// Převzato z michal-k-cmd/vinisto_data_db (web/src/lib/vinisto-auth.ts) – přihlášení
// do tesla data DB jde přes účty vinisto platformy (superadmin + app_users).
//
// Princip (viz docs/vinisto-auth-examples.md):
//   * login: PUT /user-api/users/auth/Login (email+heslo, hashType ADMIN)
//     → loginHash + permissions; do aplikace pouštíme VÝHRADNĚ účty
//     se superadmin = yes (natvrdo, bez konfigurace).
//   * vinisto loginHash nemá TTL a rotuje se → držíme VLASTNÍ session
//     s vlastní expirací (8 h) v HMAC-podepsané httpOnly cookie.
//   * heslo se nikam neukládá ani neloguje; loginHash žije jen v podepsané
//     httpOnly cookie (JS se k němu nedostane).

import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

const LOGIN_ENDPOINT = "/user-api/users/auth/Login";
const LOGOUT_ENDPOINT = "/user-api/users/auth/Logout";
const VALIDATE_ENDPOINT = "/user-api/users/auth";
const CHECK_PERMISSION_ENDPOINT = "/user-api/users/CheckPermission";
const DEFAULT_API_KEY = "b2btest1";

export const SESSION_COOKIE = "tesla_data_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 h – naše vlastní politika

export type VinistoSession = {
  userId: string;
  email: string;
  loginHash: string;
  permissions: string[];
  isSuperAdmin: boolean;
  expiresAt: number;
  /** práva na sekce appky (["*"] = vše); doplňuje login route z app_users */
  sections?: string[];
  /** smí spravovat uživatele a nastavení appky */
  isAppAdmin?: boolean;
  /** marker, že login route ověřila přístup do appky (superadmin/app_users) */
  appAccess?: boolean;
};

function baseUrl(): string {
  const url = (process.env.VINISTO_API_BASE_URL || "").replace(/\/$/, "");
  if (!url) throw new Error("Chybí VINISTO_API_BASE_URL");
  return url;
}

function apiHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-Key": process.env.VINISTO_API_KEY || DEFAULT_API_KEY,
  };
}

/** Tajemství pro podpis session cookie. */
function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_TOKEN;
  if (!secret) {
    throw new Error("Nastavte SESSION_SECRET (nebo alespoň ADMIN_TOKEN) pro přihlašování");
  }
  return secret;
}



// ---------------------------------------------------------------------------
// Volání vinisto user-api
// ---------------------------------------------------------------------------

export type LoginResult =
  | { ok: true; session: VinistoSession }
  | { ok: false; reason: "bad_credentials" | "forbidden" | "unavailable"; detail?: string };

export async function loginAgainstVinisto(
  email: string,
  password: string,
  options?: { requireSuperAdmin?: boolean },
): Promise<LoginResult> {
  let payload: {
    isError?: boolean;
    error?: unknown;
    user?: {
      id?: string;
      email?: string;
      loginHash?: string;
      permissions?: string[];
      isSuperAdmin?: boolean;
    };
  };
  try {
    const response = await fetch(baseUrl() + LOGIN_ENDPOINT, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify({ email, password, hashType: "ADMIN" }),
    });
    if (!response.ok) return { ok: false, reason: "unavailable", detail: `HTTP ${response.status}` };
    payload = await response.json();
  } catch {
    return { ok: false, reason: "unavailable", detail: "vinisto API nedostupné" };
  }

  const user = payload.user;
  if (payload.isError || !user?.loginHash) {
    return { ok: false, reason: "bad_credentials" };
  }

  const permissions = user.permissions ?? [];
  // Default NATVRDO: do aplikace smí účty se superadmin = yes. Od zavedení
  // uživatelů a práv (app_users) může login route zavolat
  // requireSuperAdmin=false a ne-superadminy pustit/odmítnout sama podle
  // tabulky app_users (když nepustí, MUSÍ sama zavolat logoutAgainstVinisto).
  if (user.isSuperAdmin !== true && options?.requireSuperAdmin !== false) {
    // hash nenecháváme žít, když uživatele dál nepustíme
    void logoutAgainstVinisto(user.loginHash);
    return { ok: false, reason: "forbidden" };
  }

  return {
    ok: true,
    session: {
      userId: user.id ?? "",
      email: user.email ?? email,
      loginHash: user.loginHash,
      permissions,
      isSuperAdmin: !!user.isSuperAdmin,
      expiresAt: Date.now() + SESSION_TTL_MS,
    },
  };
}

export async function logoutAgainstVinisto(loginHash: string): Promise<void> {
  try {
    await fetch(baseUrl() + LOGOUT_ENDPOINT, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify({ userLoginHash: loginHash, hashType: "ADMIN" }),
    });
  } catch {
    // best-effort – naše session zaniká smazáním cookie tak jako tak
  }
}

/** Revalidace session přímo u vinista (hash mohl být zrotován jiným loginem). */
export async function isHashStillValid(loginHash: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${baseUrl()}${VALIDATE_ENDPOINT}?userLoginHash=${encodeURIComponent(loginHash)}`,
      { headers: apiHeaders() },
    );
    if (!response.ok) return false;
    const payload = await response.json();
    return !payload.isError && !!payload.user;
  } catch {
    return false;
  }
}

/** Tvrdé ověření konkrétního práva u vinista (ne z cache v session). */
export async function checkPermissionLive(loginHash: string, permissionId: string): Promise<boolean> {
  try {
    const response = await fetch(baseUrl() + CHECK_PERMISSION_ENDPOINT, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ userLoginHash: loginHash, permissionId }),
    });
    if (!response.ok) return false;
    const payload = await response.json();
    return payload.result === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Vlastní session: HMAC-SHA256 podepsaný JSON v httpOnly cookie
// ---------------------------------------------------------------------------

function sign(data: string): string {
  return createHmac("sha256", sessionSecret()).update(data).digest("base64url");
}

export function encodeSession(session: VinistoSession): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSession(token: string | undefined): VinistoSession | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString()) as VinistoSession;
    if (!session.expiresAt || Date.now() > session.expiresAt) return null;
    return session;
  } catch {
    return null;
  }
}

export function getSession(request: NextRequest): VinistoSession | null {
  return decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(response: NextResponse, session: VinistoSession): void {
  response.cookies.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/**
 * Ochrana proti CSRF u cookie-autentizovaných mutací: SameSite=Lax cookie
 * cross-site POST nepošle, a navíc odmítáme requesty s cizím Origin.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // ne-browser klienti (curl, server-to-server)
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
