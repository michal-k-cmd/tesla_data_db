// Výsledek porovnání Helios ↔ e-shop (JSON). Přihlášení s právem na sekci
// Porovnání, nebo x-api-key z DATA_API_KEYS / ADMIN_TOKEN.
//   GET /api/compare?vat=without|with&pairs=0|1

import { NextRequest, NextResponse } from "next/server";
import { checkDataAccess } from "@/lib/auth";
import { computeCompare } from "@/lib/compare";
import { loadProducts } from "@/lib/products-store";
import { canSection } from "@/lib/request-user";
import { getSession } from "@/lib/vinisto-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!checkDataAccess(request, true) || (getSession(request) && !canSection(request, "compare"))) {
    return NextResponse.json({ error: "Nepřihlášen nebo bez práva" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const result = computeCompare(await loadProducts("helios"), await loadProducts("shoptet"), {
    heliosPriceVat: sp.get("vat") === "with" ? "with" : "without",
  });
  const withPairs = sp.get("pairs") !== "0";
  return NextResponse.json(withPairs ? result : { ...result, pairs: undefined });
}
