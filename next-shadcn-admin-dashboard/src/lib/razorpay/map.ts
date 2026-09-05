import type { FinKind, FinRecord } from "@/lib/close/types";

/**
 * Map Razorpay REST / webhook entities onto Controller `FinRecord`s.
 *
 * Amounts on the API are integer paise. Payments and refunds stay on the
 * gateway source; a settlement with a UTR also emits a bank row so the close
 * matcher can join `raw.settlementId` (see `reconcileUpload`).
 */

export interface RazorpayPayment {
  id: string;
  amount?: number;
  currency?: string;
  status?: string;
  fee?: number;
  tax?: number;
  order_id?: string | null;
  email?: string | null;
  contact?: string | null;
  description?: string | null;
  created_at?: number;
  notes?: Record<string, string>;
}

export interface RazorpaySettlement {
  id: string;
  amount?: number;
  status?: string;
  fees?: number;
  tax?: number;
  utr?: string | null;
  created_at?: number;
}

export interface RazorpayRefund {
  id: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  created_at?: number;
}

export interface RazorpayDispute {
  id: string;
  payment_id?: string;
  amount?: number;
  currency?: string;
  reason_code?: string;
  status?: string;
  created_at?: number;
}

function unixToIso(unix?: number): string {
  if (!unix || !Number.isFinite(unix)) return new Date().toISOString();
  return new Date(unix * 1000).toISOString();
}

function record(input: {
  id: string;
  source: FinRecord["source"];
  kind: FinKind;
  sourceRef: string;
  amountPaise: number;
  ts: string;
  counterparty?: string;
  description?: string;
  raw?: Record<string, unknown>;
}): FinRecord {
  return {
    id: input.id,
    source: input.source,
    sourceName: input.source === "bank" ? "Bank UTR" : "Razorpay Gateway",
    kind: input.kind,
    sourceRef: input.sourceRef,
    ts: input.ts,
    amountPaise: input.amountPaise,
    currency: "INR",
    counterparty: input.counterparty,
    description: input.description,
    raw: input.raw ?? {},
  };
}

export function mapPayment(
  pay: RazorpayPayment,
  settlementId?: string,
): FinRecord[] {
  const amount = Number(pay.amount ?? 0);
  if (!pay.id || !Number.isFinite(amount) || amount === 0) return [];
  if (pay.status && pay.status !== "captured") return [];
  const fee = Number(pay.fee ?? 0);
  const tax = Number(pay.tax ?? 0);
  const ts = unixToIso(pay.created_at);
  const sid = settlementId?.trim() ?? "";
  const rows: FinRecord[] = [
    record({
      id: `rec:razorpay:${pay.id}`,
      source: "gateway",
      kind: "PAYMENT",
      sourceRef: pay.id,
      amountPaise: amount,
      ts,
      counterparty: pay.email ?? pay.contact ?? undefined,
      description: pay.description ?? "Razorpay payment",
      raw: {
        paymentId: pay.id,
        orderId: pay.order_id ?? "",
        settlementId: sid,
        feePaise: fee,
        feeTaxPaise: tax,
        netPaise: amount - fee,
        status: pay.status,
      },
    }),
  ];
  if (fee > 0) {
    rows.push(
      record({
        id: `rec:razorpay:fee:${pay.id}`,
        source: "gateway",
        kind: "FEE",
        sourceRef: `fee_${pay.id}`,
        amountPaise: -fee,
        ts,
        description: tax > 0 ? "Razorpay fee + tax on fee" : "Razorpay fee",
        raw: { paymentId: pay.id, settlementId: sid, feePaise: fee, feeTaxPaise: tax },
      }),
    );
  }
  return rows;
}

export function mapSettlement(setl: RazorpaySettlement): FinRecord[] {
  const amount = Number(setl.amount ?? 0);
  if (!setl.id || !Number.isFinite(amount) || amount === 0) return [];
  const ts = unixToIso(setl.created_at);
  const utr = (setl.utr ?? "").trim();
  const rows: FinRecord[] = [
    record({
      id: `rec:razorpay:${setl.id}`,
      source: "gateway",
      kind: "SETTLEMENT",
      sourceRef: setl.id,
      amountPaise: amount,
      ts,
      description: utr ? "Razorpay settlement (net of fee + tax on fee)" : "Razorpay settlement",
      raw: {
        settlementId: setl.id,
        utr,
        feePaise: Number(setl.fees ?? 0),
        feeTaxPaise: Number(setl.tax ?? 0),
        status: setl.status,
      },
    }),
  ];
  if (utr) {
    rows.push(
      record({
        id: `rec:razorpay:utr:${utr}`,
        source: "bank",
        kind: "SETTLEMENT",
        sourceRef: setl.id,
        amountPaise: amount,
        ts,
        description: "Bank UTR for Razorpay settlement",
        raw: { settlementId: setl.id, utr },
      }),
    );
  }
  return rows;
}

export function mapRefund(refund: RazorpayRefund): FinRecord[] {
  const amount = Number(refund.amount ?? 0);
  if (!refund.id || !Number.isFinite(amount) || amount === 0) return [];
  return [
    record({
      id: `rec:razorpay:${refund.id}`,
      source: "gateway",
      kind: "REFUND",
      sourceRef: refund.id,
      amountPaise: -Math.abs(amount),
      ts: unixToIso(refund.created_at),
      description: "Razorpay refund",
      raw: { refundId: refund.id, paymentId: refund.payment_id ?? "" },
    }),
  ];
}

/** Dispute / chargeback — negative gateway leg keyed to the original payment. */
export function mapDispute(dispute: RazorpayDispute): FinRecord[] {
  const amount = Number(dispute.amount ?? 0);
  if (!dispute.id || !Number.isFinite(amount) || amount === 0) return [];
  return [
    record({
      id: `rec:razorpay:disp:${dispute.id}`,
      source: "gateway",
      kind: "CHARGEBACK",
      sourceRef: dispute.id,
      amountPaise: -Math.abs(amount),
      ts: unixToIso(dispute.created_at),
      description: dispute.reason_code ? `Razorpay dispute ${dispute.reason_code}` : "Razorpay dispute / chargeback",
      raw: {
        disputeId: dispute.id,
        paymentId: dispute.payment_id ?? "",
        status: dispute.status,
        reasonCode: dispute.reason_code,
      },
    }),
  ];
}

/** Razorpay Dashboard webhook envelope → FinRecords. Unknown events yield []. */
export function mapWebhookEvent(body: unknown): { event: string; records: FinRecord[] } {
  const envelope = body as {
    event?: string;
    payload?: {
      payment?: { entity?: RazorpayPayment };
      refund?: { entity?: RazorpayRefund };
      settlement?: { entity?: RazorpaySettlement };
    };
  };
  const event = typeof envelope?.event === "string" ? envelope.event : "";
  if (event === "payment.captured" || event === "payment.authorized") {
    const pay = envelope.payload?.payment?.entity;
    return { event, records: pay ? mapPayment(pay) : [] };
  }
  if (event === "payment.failed") {
    return { event, records: [] };
  }
  if (event === "refund.processed" || event === "refund.created") {
    const refund = envelope.payload?.refund?.entity;
    return { event, records: refund ? mapRefund(refund) : [] };
  }
  if (event === "settlement.processed") {
    const setl = envelope.payload?.settlement?.entity;
    return { event, records: setl ? mapSettlement(setl) : [] };
  }
  if (event === "payment.dispute.created" || event === "dispute.created" || event === "payment.dispute.won" || event === "payment.dispute.lost") {
    const dispute = (envelope.payload as { dispute?: { entity?: RazorpayDispute } } | undefined)?.dispute?.entity;
    return { event, records: dispute ? mapDispute(dispute) : [] };
  }
  return { event: event || "unknown", records: [] };
}

/** Stamp `raw.settlementId` on payment rows from a settlement recon dump. */
export function applyRecon(records: FinRecord[], items: RazorpayReconItem[]): FinRecord[] {
  const paymentToSetl = new Map<string, string>();
  for (const item of items) {
    if (item.payment_id && item.settlement_id) paymentToSetl.set(item.payment_id, item.settlement_id);
  }
  return records.map((r) => {
    const payId = String(r.raw?.paymentId ?? "");
    const sid = paymentToSetl.get(payId);
    if (!sid) return r;
    return { ...r, raw: { ...r.raw, settlementId: sid } };
  });
}

function testUtrForPayment(payId: string): string {
  const compact = payId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `TESTUTR${compact.slice(-12) || "RAZORPAY"}`;
}

/**
 * Razorpay test accounts never emit settlements/UTRs. Without a bank counterpart the matcher
 * correctly parks every capture as NO_KEY. For **test keys only**, synthesize one bank SETTLEMENT
 * per captured payment so the live pull can close the same way a settled live account would.
 *
 * Live keys (`testMode: false`) and accounts that already returned real settlements are left
 * untouched — we never invent a UTR against production money.
 */
export function fillTestModeBankLegs(
  records: FinRecord[],
  opts: { testMode: boolean; realSettlementCount: number },
): FinRecord[] {
  if (!opts.testMode || opts.realSettlementCount > 0) return records;

  const extra: FinRecord[] = [];
  const stamped = records.map((r) => {
    if (r.kind !== "PAYMENT" && r.kind !== "FEE") return r;
    if (String(r.raw?.settlementId ?? "").trim()) return r;
    const payId = String(r.raw?.paymentId ?? (r.kind === "PAYMENT" ? r.sourceRef : ""));
    if (!payId) return r;
    const sid = `setl_test_${payId}`;
    if (r.kind === "PAYMENT") {
      const fee = Number(r.raw?.feePaise ?? 0);
      const net = Number(r.raw?.netPaise ?? r.amountPaise - fee);
      extra.push(
        ...mapSettlement({
          id: sid,
          amount: net > 0 ? net : r.amountPaise,
          fees: fee,
          tax: Number(r.raw?.feeTaxPaise ?? 0),
          utr: testUtrForPayment(payId),
          created_at: Math.floor(new Date(r.ts).getTime() / 1000),
        }).filter((row) => row.source === "bank"),
      );
    }
    return { ...r, raw: { ...r.raw, settlementId: sid, testBankLeg: true } };
  });

  const byId = new Map<string, FinRecord>();
  for (const rec of [...stamped, ...extra]) byId.set(rec.id, rec);
  return [...byId.values()];
}
