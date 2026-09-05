import { NextResponse } from "next/server";

import { adapterFor, gst2bAdapter } from "@/lib/adapters";
import { denied, requireRole } from "@/lib/authz";
import { orgProfile } from "@/lib/close/org";
import { ensureLiveClose, getRecords } from "@/lib/close/store";
import { reconcileGst2BByInvoice } from "@/lib/finance/gst";
import { gstr2bFromRecords, internalPurchaseRows, parsedRowsToGst2b } from "@/lib/finance/gst-books";
import { loadGstr2b, saveGstr2b } from "@/lib/finance/gst-store";

export const runtime = "nodejs";

/**
 * GET /api/finance/gst/2b — latest stored 2B (upload or gateway-fee pull) vs internal books.
 * POST { text } — ingest a GSTR-2B JSON/CSV portal export and persist it.
 */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  await ensureLiveClose();
  const records = getRecords("run_today");
  const stored = await loadGstr2b();
  const internal = internalPurchaseRows(records);
  const gstr2b = stored?.rows?.length ? stored.rows : gstr2bFromRecords(records);
  const result = reconcileGst2BByInvoice(gstr2b, internal);
  return NextResponse.json({
    org: orgProfile(),
    pull: stored ?? { pulledAt: new Date().toISOString(), source: "gateway-fees", rows: gstr2b },
    internal,
    result,
  });
}

export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const text = typeof (body as { text?: string })?.text === "string" ? (body as { text: string }).text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "text (GSTR-2B JSON or CSV) is required" }, { status: 400 });
  }
  const parsed = (adapterFor("gst2b") ?? gst2bAdapter).parse(text);
  const rows = parsedRowsToGst2b(parsed.rows);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No GSTR-2B rows with a valid GSTIN", errors: parsed.errors }, { status: 400 });
  }
  const doc = { pulledAt: new Date().toISOString(), source: "upload" as const, rows };
  await saveGstr2b(doc);
  return NextResponse.json({ pull: doc, accepted: rows.length, errors: parsed.errors }, { status: 201 });
}
