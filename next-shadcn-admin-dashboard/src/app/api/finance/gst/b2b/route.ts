import { NextResponse } from "next/server";

import type { GstB2bRow } from "@/lib/finance/gst";
import { reconcileGst2BByInvoice } from "@/lib/finance/gst";

export const runtime = "nodejs";

/**
 * POST /api/finance/gst/b2b
 *
 * Body:
 *   { "gstr2b": GstB2bRow[], "internal": GstB2bRow[] }
 *
 * Reconciles internal invoices against supplier GSTR-2B rows on
 * (supplierGstin + invoiceNo) and returns the engine's deterministic reading:
 * matched / unmatched rows, match rate, eligible ITC and the ITC shortfall.
 *
 * Deterministic core only — no external credentials, no persistence. Both arrays are
 * required and must be JSON arrays; a 400 is returned with a clear message otherwise.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "A JSON body is required with both a gstr2b and an internal array of GstB2bRow rows." },
      { status: 400 },
    );
  }

  const { gstr2b, internal } = (body ?? {}) as { gstr2b?: unknown; internal?: unknown };

  if (!Array.isArray(gstr2b) || !Array.isArray(internal)) {
    return NextResponse.json(
      {
        error:
          "Both 'gstr2b' and 'internal' must be present and be arrays of GstB2bRow (supplierGstin, invoiceNo, invoiceDate, taxablePaise, taxPaise, totalPaise, source).",
      },
      { status: 400 },
    );
  }

  return NextResponse.json(reconcileGst2BByInvoice(gstr2b as GstB2bRow[], internal as GstB2bRow[]));
}
