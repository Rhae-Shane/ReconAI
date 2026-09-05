/**
 * GSTR-1 / GSTR-3B draft + sandbox submit.
 *
 * Live GSTN filing needs a GSP + DSC/OTP and is not called from here. Submit writes a
 * signed (sha256) filing artifact for Rhae so the close package is auditable.
 */

import { orgGstin, orgProfile } from "@/lib/close/org";
import type { Gst2BReconcileResult, GstB2bRow } from "@/lib/finance/gst";
import type { OutwardSupply } from "@/lib/finance/gst-books";

import { createHash } from "node:crypto";

export type GstReturnKind = "GSTR1" | "GSTR3B";

export interface GstFiling {
  id: string;
  kind: GstReturnKind;
  gstin: string;
  period: string;
  status: "DRAFT" | "SUBMITTED";
  hash: string;
  submittedAt?: string;
  submittedBy?: string;
  payload: Record<string, unknown>;
}

export function gstPeriod(iso = new Date().toISOString()): string {
  const d = new Date(iso);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${mm}${d.getUTCFullYear()}`;
}

export function buildGstr1(supplies: OutwardSupply[], period = gstPeriod()): Record<string, unknown> {
  const org = orgProfile();
  const b2b = supplies.filter((s) => s.gstin);
  const b2cs = supplies.filter((s) => !s.gstin);
  const sum = (rows: OutwardSupply[]) => ({
    txval: rows.reduce((a, r) => a + r.taxablePaise, 0) / 100,
    iamt: 0,
    camt: rows.reduce((a, r) => a + r.taxPaise, 0) / 200,
    samt: rows.reduce((a, r) => a + r.taxPaise, 0) / 200,
    csamt: 0,
  });
  return {
    gstin: org.gstin,
    fp: period,
    gt: 0,
    cur_gt: 0,
    b2b: b2b.map((s) => ({
      ctin: s.gstin,
      inv: [
        {
          inum: s.invoiceNo,
          idt: s.invoiceDate.split("-").reverse().join("-"),
          val: s.totalPaise / 100,
          pos: s.pos,
          rchrg: "N",
          inv_typ: "R",
          itms: [
            {
              num: 1,
              itm_det: { txval: s.taxablePaise / 100, rt: 18, camt: s.taxPaise / 200, samt: s.taxPaise / 200 },
            },
          ],
        },
      ],
    })),
    b2cs: b2cs.length
      ? [
          {
            sply_ty: "INTRA",
            pos: org.stateCode,
            typ: "OE",
            ...sum(b2cs),
          },
        ]
      : [],
  };
}

export function buildGstr3b(
  supplies: OutwardSupply[],
  itc: Gst2BReconcileResult,
  period = gstPeriod(),
): Record<string, unknown> {
  const outwardTax = supplies.reduce((a, s) => a + s.taxPaise, 0);
  const outwardTaxable = supplies.reduce((a, s) => a + s.taxablePaise, 0);
  const itcPaise = itc.itcEligiblePaise > 0 ? Math.round(itc.matched.reduce((a, r) => a + r.taxPaise, 0)) : 0;
  return {
    gstin: orgGstin(),
    ret_period: period,
    sup_details: {
      osup_det: { txval: outwardTaxable / 100, iamt: 0, camt: outwardTax / 200, samt: outwardTax / 200, csamt: 0 },
    },
    itc_elg: {
      itc_avl: [{ ty: "IMPG", iamt: 0, camt: itcPaise / 200, samt: itcPaise / 200, csamt: 0 }],
    },
    inward_sup: { isup_details: [] },
    intr_ltfee: { unreg_details: [] },
  };
}

export function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function draftFiling(kind: GstReturnKind, payload: Record<string, unknown>, period = gstPeriod()): GstFiling {
  return {
    id: `gst_${kind.toLowerCase()}_${period}_${hashPayload(payload).slice(0, 10)}`,
    kind,
    gstin: orgGstin(),
    period,
    status: "DRAFT",
    hash: hashPayload(payload),
    payload,
  };
}

export function markSubmitted(filing: GstFiling, actor: string, at = new Date().toISOString()): GstFiling {
  return { ...filing, status: "SUBMITTED", submittedAt: at, submittedBy: actor };
}

export function unmatchedInvoiceNos(unmatched: GstB2bRow[]): string[] {
  return unmatched.map((r) => r.invoiceNo);
}
