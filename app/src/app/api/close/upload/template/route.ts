import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { CSV_TEMPLATE } from "@/lib/close/csv-map";

export const runtime = "nodejs";

/** GET /api/close/upload/template — canonical payments/settlements CSV for the mapper. */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  return new NextResponse(CSV_TEMPLATE, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="rhae-close-template.csv"',
    },
  });
}
