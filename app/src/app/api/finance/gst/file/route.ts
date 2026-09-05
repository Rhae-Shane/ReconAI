import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { recordUsage } from "@/lib/billing/meter";
import { orgProfile } from "@/lib/close/org";
import { ensureLiveClose, getRecords } from "@/lib/close/store";
import { reconcileGst2BByInvoice } from "@/lib/finance/gst";
import { gstr2bFromRecords, internalPurchaseRows, outwardSupplies } from "@/lib/finance/gst-books";
import { buildGstr1, buildGstr3b, draftFiling, gstPeriod, markSubmitted, type GstReturnKind } from "@/lib/finance/gst-file";
import { listFilings, loadGstr2b, saveFiling } from "@/lib/finance/gst-store";

export const runtime = "nodejs";

/** GET /api/finance/gst/file — drafts + filing history for Rhae. */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  await ensureLiveClose();
  const records = getRecords("run_today");
  const supplies = outwardSupplies(records);
  const stored = await loadGstr2b();
  const gstr2b = stored?.rows?.length ? stored.rows : gstr2bFromRecords(records);
  const itc = reconcileGst2BByInvoice(gstr2b, internalPurchaseRows(records));
  const period = gstPeriod();
  const gstr1 = draftFiling("GSTR1", buildGstr1(supplies, period), period);
  const gstr3b = draftFiling("GSTR3B", buildGstr3b(supplies, itc, period), period);
  return NextResponse.json({
    org: orgProfile(),
    period,
    drafts: { GSTR1: gstr1, GSTR3B: gstr3b },
    filings: await listFilings(),
  });
}

/**
 * POST /api/finance/gst/file — sandbox-submit a GSTR-1 or GSTR-3B draft.
 * Does not call GSTN; stores a signed hash for the audit package.
 */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const kind = (body as { kind?: GstReturnKind })?.kind;
  if (kind !== "GSTR1" && kind !== "GSTR3B") {
    return NextResponse.json({ error: "kind must be GSTR1 or GSTR3B" }, { status: 400 });
  }

  await ensureLiveClose();
  const records = getRecords("run_today");
  const supplies = outwardSupplies(records);
  const stored = await loadGstr2b();
  const gstr2b = stored?.rows?.length ? stored.rows : gstr2bFromRecords(records);
  const itc = reconcileGst2BByInvoice(gstr2b, internalPurchaseRows(records));
  const period = gstPeriod();
  const payload = kind === "GSTR1" ? buildGstr1(supplies, period) : buildGstr3b(supplies, itc, period);
  const filing = markSubmitted(draftFiling(kind, payload, period), verdict.role);
  await saveFiling(filing);
  await recordUsage({ kind: "gst_file", quantity: 1 });
  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "gst:file",
    target: filing.id,
    detail: `${kind} ${period} ${filing.hash.slice(0, 12)}`,
  });
  return NextResponse.json({ filing, portal: "sandbox" }, { status: 201 });
}
