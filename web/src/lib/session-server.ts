// Session v server components (stránky) – stejná HMAC cookie jako API routy.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeSession, SESSION_COOKIE, VinistoSession } from "./vinisto-auth";
import { hasSection } from "@/config/app-sections";

export async function currentSession(): Promise<VinistoSession | null> {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session || (session.isSuperAdmin !== true && session.appAccess !== true)) return null;
  return session;
}

/** stránka jen pro přihlášené s právem na sekci; jinak login / přehled */
export async function requireSection(section: string): Promise<VinistoSession> {
  const session = await currentSession();
  if (!session) redirect("/login");
  if (!hasSection(session.sections ?? (session.isSuperAdmin ? ["*"] : []), section)) redirect("/");
  return session;
}

export function sessionSections(session: VinistoSession): string[] {
  return session.sections ?? (session.isSuperAdmin ? ["*"] : []);
}
