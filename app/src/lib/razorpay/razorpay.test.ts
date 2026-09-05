import { afterEach, describe, expect, it, vi } from "vitest";

import { isRazorpayConfigured, razorpayConfig } from "./config";
import { inboxClear, inboxList, inboxPush, inboxTake } from "./inbox";
import {
  applyRecon,
  fillTestModeBankLegs,
  mapDispute,
  mapPayment,
  mapRefund,
  mapSettlement,
  mapWebhookEvent,
} from "./map";
import { computeRazorpaySignature, verifyRazorpaySignature } from "./webhook";

afterEach(() => {
  inboxClear();
});

describe("razorpayConfig", () => {
  it("is unset without keys so the close loop stays CSV/synthetic", () => {
    expect(razorpayConfig({})).toBeNull();
    expect(isRazorpayConfigured({})).toBe(false);
  });

  it("reads test-mode keys when both are present", () => {
    const cfg = razorpayConfig({
      RAZORPAY_KEY_ID: "rzp_test_abc",
      RAZORPAY_KEY_SECRET: "secret",
      RAZORPAY_WEBHOOK_SECRET: "whsec",
    });
    expect(cfg).toEqual({
      keyId: "rzp_test_abc",
      keySecret: "secret",
      webhookSecret: "whsec",
    });
  });
});

describe("verifyRazorpaySignature", () => {
  const payload = '{"event":"payment.captured"}';
  const secret = "whsec";

  it("accepts a genuine HMAC", () => {
    const sig = computeRazorpaySignature(payload, secret);
    expect(verifyRazorpaySignature(payload, sig, secret)).toBe(true);
  });

  it("denies a missing secret, missing signature, or tamper", () => {
    const sig = computeRazorpaySignature(payload, secret);
    expect(verifyRazorpaySignature(payload, sig, "")).toBe(false);
    expect(verifyRazorpaySignature(payload, null, secret)).toBe(false);
    expect(verifyRazorpaySignature('{"event":"tampered"}', sig, secret)).toBe(false);
  });
});

describe("map Razorpay entities → FinRecord", () => {
  it("skips failed or uncaptured payments", () => {
    expect(mapPayment({ id: "pay_fail", amount: 49900, status: "failed" })).toHaveLength(0);
    expect(mapPayment({ id: "pay_auth", amount: 100, status: "authorized" })).toHaveLength(0);
  });

  it("maps a captured payment + fee line", () => {
    const rows = mapPayment({
      id: "pay_1",
      amount: 100000,
      fee: 2360,
      tax: 360,
      order_id: "order_1",
      created_at: 1_700_000_000,
      email: "a@b.com",
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "rec:razorpay:pay_1",
      kind: "PAYMENT",
      source: "gateway",
      amountPaise: 100000,
      raw: expect.objectContaining({ orderId: "order_1", feePaise: 2360 }),
    });
    expect(rows[1]).toMatchObject({ kind: "FEE", amountPaise: -2360 });
  });

  it("maps a settlement and emits a bank UTR row", () => {
    const rows = mapSettlement({
      id: "setl_1",
      amount: 97640,
      fees: 2360,
      tax: 360,
      utr: "HDFC0001",
      created_at: 1_700_000_000,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "SETTLEMENT", source: "gateway", sourceRef: "setl_1" });
    expect(rows[1]).toMatchObject({ kind: "SETTLEMENT", source: "bank", raw: { utr: "HDFC0001" } });
  });

  it("maps a refund as a negative gateway row", () => {
    const rows = mapRefund({ id: "rfnd_1", payment_id: "pay_1", amount: 5000, created_at: 1_700_000_000 });
    expect(rows[0]).toMatchObject({ kind: "REFUND", amountPaise: -5000, raw: { paymentId: "pay_1" } });
  });

  it("maps a dispute as a CHARGEBACK keyed to the payment", () => {
    const rows = mapDispute({
      id: "disp_1",
      payment_id: "pay_1",
      amount: 100000,
      reason_code: "duplicate",
      created_at: 1_700_000_000,
    });
    expect(rows[0]).toMatchObject({
      kind: "CHARGEBACK",
      amountPaise: -100000,
      raw: expect.objectContaining({ paymentId: "pay_1" }),
    });
  });

  it("maps payment.captured / settlement.processed webhooks and ignores unknown events", () => {
    const captured = mapWebhookEvent({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_w", amount: 2000, created_at: 1 } } },
    });
    expect(captured.records[0]?.sourceRef).toBe("pay_w");
    const setl = mapWebhookEvent({
      event: "settlement.processed",
      payload: { settlement: { entity: { id: "setl_w", amount: 2000, utr: "U1", created_at: 1 } } },
    });
    expect(setl.records.some((r) => r.source === "bank")).toBe(true);
    expect(mapWebhookEvent({ event: "invoice.paid" }).records).toHaveLength(0);
  });

  it("stamps settlementId from recon onto payment rows", () => {
    const rows = applyRecon(mapPayment({ id: "pay_1", amount: 100 }), [
      { payment_id: "pay_1", settlement_id: "setl_9" },
    ]);
    expect(rows[0]?.raw?.settlementId).toBe("setl_9");
  });
});

describe("fillTestModeBankLegs", () => {
  const captured = mapPayment({
    id: "pay_1",
    amount: 100000,
    fee: 2360,
    status: "captured",
    created_at: 1_700_000_000,
  });

  it("does not invent UTRs for live keys or when real settlements exist", () => {
    expect(fillTestModeBankLegs(captured, { testMode: false, realSettlementCount: 0 })).toEqual(captured);
    expect(fillTestModeBankLegs(captured, { testMode: true, realSettlementCount: 2 })).toEqual(captured);
  });

  it("synthesizes a bank UTR per capture in test mode with no settlements", () => {
    const filled = fillTestModeBankLegs(captured, { testMode: true, realSettlementCount: 0 });
    const payment = filled.find((r) => r.kind === "PAYMENT");
    const bank = filled.find((r) => r.source === "bank" && r.kind === "SETTLEMENT");
    expect(payment?.raw?.settlementId).toBe("setl_test_pay_1");
    expect(payment?.raw?.testBankLeg).toBe(true);
    expect(bank?.sourceRef).toBe("setl_test_pay_1");
    expect(String(bank?.raw?.utr ?? "")).toMatch(/^TESTUTR/);
  });

  it("lets the matcher close test-mode captures against synthesized bank legs", async () => {
    const { runFromUpload } = await import("@/lib/close/store");
    const filled = fillTestModeBankLegs(captured, { testMode: true, realSettlementCount: 0 });
    const { report } = runFromUpload(filled);
    expect(report.totals.exceptions).toBe(0);
    expect(report.totals.matched).toBe(filled.length);
    expect(report.totals.groups).toBeGreaterThan(0);
  });
});

describe("webhook inbox", () => {
  it("dedupes by record id and take() drains", () => {
    const rec = mapPayment({ id: "pay_x", amount: 1 })[0]!;
    expect(inboxPush([rec, rec])).toBe(1);
    expect(inboxList()).toHaveLength(1);
    expect(inboxTake()).toHaveLength(1);
    expect(inboxList()).toHaveLength(0);
  });
});

describe("webhookEventId", () => {
  it("prefers the Razorpay event header and hashes the body otherwise", async () => {
    const { webhookEventId } = await import("./webhook-ledger");
    expect(webhookEventId("{}", "evt_1")).toBe("evt_1");
    expect(webhookEventId("{}", null)).toHaveLength(64);
  });
});

describe("pullRazorpayBatch is a no-op without keys", () => {
  it("returns null and never fetches", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { pullRazorpayBatch } = await import("./client");
    await expect(pullRazorpayBatch({})).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
