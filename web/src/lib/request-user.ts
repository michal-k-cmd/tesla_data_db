import { NextRequest } from "next/server";
import { checkAdminToken } from "./auth";
import { getSession } from "./vinisto-auth";
import { hasSection } from "@/config/app-sections";

/** kdo volá (e-mail ze session, „admin-token" pro skripty) */
export function requestUser(request: NextRequest): string | null {
  if (checkAdminToken(request)) return "admin-token";
  return getSession(request)?.email ?? null;
}

/** právo na sekci u API route (ADMIN_TOKEN = vše) */
export function canSection(request: NextRequest, section: string): boolean {
  if (checkAdminToken(request)) return true;
  const session = getSession(request);
  if (!session) return false;
  return hasSection(session.sections ?? (session.isSuperAdmin ? ["*"] : []), section);
}
