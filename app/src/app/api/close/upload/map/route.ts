import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { detectHeaders, MAP_TARGETS, suggestMapping } from "@/lib/close/csv-map";

export const runtime = "nodejs";

/** POST /api/close/upload/map — suggest a column mapping from CSV headers. */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const text = typeof (body as { text?: string })?.text === "string" ? (body as { text: string }).text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text (CSV) is required" }, { status: 400 });
  }
  const headers = detectHeaders(text);
  return NextResponse.json({ headers, mapping: suggestMapping(headers), targets: MAP_TARGETS });
}
