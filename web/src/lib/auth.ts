import { timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { getSession, isSameOrigin } from "./vinisto-auth";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Ověří ADMIN_TOKEN z hlavičky x-admin-token nebo Authorization: Bearer. */
export function checkAdminToken(request: NextRequest): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false;
  const header =
    request.headers.get("x-admin-token") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return safeEqual(header, expected);
}

/**
 * Autorizace admin akcí a čtení dashboardu:
 *   1. přihlášený uživatel (vinisto session cookie; u mutací + kontrola Origin), nebo
 *   2. ADMIN_TOKEN v hlavičce (pro skripty / server-to-server).
 */
export function checkAdminAuth(request: NextRequest): boolean {
  if (checkAdminToken(request)) return true;
  const session = getSession(request);
  if (!session) return false;
  // superadmin platformy vždy (platí i pro dříve vydané session cookies);
  // ostatní jen se session vydanou po ověření proti app_users (appAccess –
  // marker nastavuje výhradně login route, cookie je HMAC podepsaná)
  if (session.isSuperAdmin !== true && session.appAccess !== true) return false;
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  return isMutation ? isSameOrigin(request) : true;
}

/** Admin appky: superadmin platformy, app_users.is_admin, nebo ADMIN_TOKEN.
 *  Chrání správu uživatelů a zásadní nastavení. */
export function checkAppAdmin(request: NextRequest): boolean {
  if (checkAdminToken(request)) return true;
  const session = getSession(request);
  if (!session) return false;
  if (session.isSuperAdmin !== true && session.isAppAdmin !== true) return false;
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method);
  return isMutation ? isSameOrigin(request) : true;
}

/**
 * Přístup ke klonovaným datovým endpointům /api/data/*:
 *   - když je nastaven DATA_API_KEYS (čárkami oddělený seznam), vyžaduje se
 *     platný klíč v hlavičce x-api-key, NEBO přihlášená session / ADMIN_TOKEN;
 *   - bez DATA_API_KEYS zůstávají endpointy veřejné (zpětná kompatibilita) –
 *     KROMĚ citlivých entit (sensitive=true), které veřejné nejsou nikdy.
 */
export function checkDataAccess(request: NextRequest, sensitive = false): boolean {
  const keys = (process.env.DATA_API_KEYS ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
  if (keys.length === 0 && !sensitive) return true;
  const provided = request.headers.get("x-api-key") ?? "";
  if (provided && keys.some((key) => safeEqual(provided, key))) return true;
  return checkAdminAuth(request);
}

/** Ověří CRON_SECRET (Vercel Cron posílá Authorization: Bearer <CRON_SECRET>). */
export function checkCronSecret(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // FAIL-CLOSED (od audit-fixu): bez nastaveného CRON_SECRET by byl
  // /api/cron/sync veřejně spustitelný (plný sync, denní automaty, ostré
  // zápisy do platformy). Radši sync neproběhne, než aby ho spustil kdokoli.
  // ADMIN_TOKEN je fallback pro ruční spuštění.
  if (!expected) return checkAdminToken(request);
  const header = request.headers.get("authorization") ?? "";
  return safeEqual(header, `Bearer ${expected}`) || checkAdminToken(request);
}
