// Log přístupů na naše endpointy – i odmítnutých pokusů (špatný token apod.).
// Fire-and-forget: nikdy nesmí shodit ani zpomalit request.
import { NextRequest } from "next/server";
import { getPool } from "./db";

export type AccessOutcome = "ok" | "unauthorized" | "bad_request" | "error";

// jen poslední 4 znaky klíče – identifikace klienta, ne tajemství
function keyHint(request: NextRequest): string | null {
  const k =
    request.headers.get("x-api-key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return k ? `…${k.slice(-4)}` : null;
}

function clientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

/** Zaznamená přístup. Chyba zápisu se ignoruje (request nesmí spadnout).
 *  `identity` = e-mail u přihlášení do appky (u API klíčů se nechává null). */
export function logAccess(
  request: NextRequest,
  path: string,
  status: number,
  outcome: AccessOutcome,
  identity?: string | null,
): void {
  const ua = request.headers.get("user-agent");
  void getPool()
    .query(
      `INSERT INTO access_log (method, path, status, outcome, api_key_hint, identity, ip, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        request.method,
        path,
        status,
        outcome,
        keyHint(request),
        identity ?? null,
        clientIp(request),
        ua ? ua.slice(0, 200) : null,
      ],
    )
    .catch(() => {});
}
