// Export rozdílů do CSV (Excel: UTF-8 s BOM, oddělovač ;).
//   GET /api/compare/export?field=<klíč pole>&status=different|all&vat=without|with
// Jeden řádek = produkt × pole (jen pole se zvoleným stavem).

import { NextRequest, NextResponse } from "next/server";
import { checkDataAccess } from "@/lib/auth";
import { computeCompare, FIELDS } from "@/lib/compare";
import { loadProducts } from "@/lib/products-store";
import { canSection } from "@/lib/request-user";
import { getSession } from "@/lib/vinisto-auth";
import { fmtValue } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  equal: "shoda",
  different: "liší se",
  only_helios: "jen Helios",
  only_shoptet: "jen e-shop",
  both_empty: "prázdné v obou",
};

function csvCell(v: unknown): string {
  const s = fmtValue(v).replace(/\r?\n/g, " ");
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  if (!checkDataAccess(request, true) || (getSession(request) && !canSection(request, "compare"))) {
    return NextResponse.json({ error: "Nepřihlášen nebo bez práva" }, { status: 401 });
  }
  const sp = request.nextUrl.searchParams;
  const field = sp.get("field");
  const status = sp.get("status") ?? "different";
  const fields = FIELDS.filter((f) => !field || String(f.key) === field);
  const result = computeCompare(await loadProducts("helios"), await loadProducts("shoptet"), {
    heliosPriceVat: sp.get("vat") === "with" ? "with" : "without",
  });

  const lines = [["kód Helios", "kód e-shop", "spárováno přes", "název", "pole", "stav", "Helios", "e-shop", "navržený master"].join(";")];
  for (const p of result.pairs) {
    for (const f of fields) {
      const cell = p.cells[String(f.key)];
      if (status !== "all" && cell.status !== status) continue;
      lines.push([p.code, p.shoptet_code, p.matched_by, p.name, f.label, STATUS_LABEL[cell.status], cell.helios, cell.shoptet, f.master]
        .map(csvCell).join(";"));
    }
  }
  const name = `porovnani-${field ?? "vse"}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
