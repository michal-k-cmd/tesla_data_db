// Rate limit přihlašování proti hádání hesel (bezpečnostní audit). Serverless
// nemá sdílenou paměť mezi invokacemi → čítač neúspěšných pokusů se drží
// v DB (sync_settings, klíč `login_attempts`) v okně LOGIN_WINDOW_MS. Limituje
// se per IP i per e-mail zvlášť (útok na jeden účet i plošné hádání).
//
// Fail-open úmyslně: když DB čtení/zápis selže, přihlášení se NEzablokuje
// (nechceme kvůli výpadku sync_settings vyřadit login) – jen se ztratí ochrana.

import { getSetting, setSetting } from "./settings";

const WINDOW_MS = 15 * 60_000; // 15 min
const MAX_PER_KEY = 10; // pokusů na IP nebo e-mail v okně
const KEY = "login_attempts";

type Attempt = { at: number };
type Store = Record<string, Attempt[]>;

function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for") ?? "";
  return fwd.split(",")[0].trim() || headers.get("x-real-ip") || "unknown";
}

/** Vrátí true, pokud je IP nebo e-mail přes limit (má se odmítnout). */
export async function isLoginRateLimited(headers: Headers, email: string): Promise<boolean> {
  try {
    const now = Date.now();
    const store = await getSetting<Store>(KEY, {});
    const ipKey = `ip:${clientIp(headers)}`;
    const emailKey = `email:${email.toLowerCase()}`;
    const fresh = (arr: Attempt[] | undefined) =>
      (arr ?? []).filter((a) => now - a.at < WINDOW_MS);
    return fresh(store[ipKey]).length >= MAX_PER_KEY || fresh(store[emailKey]).length >= MAX_PER_KEY;
  } catch {
    return false; // fail-open
  }
}

/** Zaznamená neúspěšný pokus (po ověření, že heslo bylo špatně). */
export async function recordLoginFailure(headers: Headers, email: string): Promise<void> {
  try {
    const now = Date.now();
    const store = await getSetting<Store>(KEY, {});
    const ipKey = `ip:${clientIp(headers)}`;
    const emailKey = `email:${email.toLowerCase()}`;
    const fresh = (arr: Attempt[] | undefined) =>
      (arr ?? []).filter((a) => now - a.at < WINDOW_MS);
    // prune všech klíčů, ať store neroste donekonečna
    const next: Store = {};
    for (const [k, v] of Object.entries(store)) {
      const f = fresh(v);
      if (f.length) next[k] = f;
    }
    next[ipKey] = [...fresh(store[ipKey]), { at: now }];
    next[emailKey] = [...fresh(store[emailKey]), { at: now }];
    await setSetting(KEY, next);
  } catch {
    /* fail-open */
  }
}

/** Úspěšné přihlášení – vynuluje pokusy pro daný e-mail. */
export async function clearLoginFailures(email: string): Promise<void> {
  try {
    const store = await getSetting<Store>(KEY, {});
    const emailKey = `email:${email.toLowerCase()}`;
    if (store[emailKey]) {
      delete store[emailKey];
      await setSetting(KEY, store);
    }
  } catch {
    /* fail-open */
  }
}
