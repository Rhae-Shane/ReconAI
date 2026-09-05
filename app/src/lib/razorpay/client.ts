import { type RazorpayConfig, razorpayAuthHeader, razorpayConfig } from "./config";
import type { RazorpayDispute, RazorpayPayment, RazorpayReconItem, RazorpayRefund, RazorpaySettlement } from "./map";

/**
 * Thin Razorpay REST client (no SDK — same fetch + Basic auth as Growth / Recovery).
 *
 * Used by the Controller to pull payments, settlements, refunds, and settlement
 * recon so a close run can ingest live test-mode data instead of CSV only.
 */

const RAZORPAY_API = "https://api.razorpay.com/v1";

export class RazorpayApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

async function getJson<T>(cfg: RazorpayConfig, path: string): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, { headers: razorpayAuthHeader(cfg) });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new RazorpayApiError(`razorpay_http_${res.status}: ${text}`, res.status);
  }
  return (await res.json()) as T;
}

async function postJson<T>(cfg: RazorpayConfig, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${RAZORPAY_API}${path}`, {
    method: "POST",
    headers: razorpayAuthHeader(cfg),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 300);
    throw new RazorpayApiError(`razorpay_http_${res.status}: ${text}`, res.status);
  }
  return (await res.json()) as T;
}

export interface RazorpayPaymentLink {
  id: string;
  short_url: string;
  amount: number;
  status: string;
}

/** Create a one-shot payment link in the connected Razorpay mode (test or live). */
export async function createPaymentLink(
  env: Record<string, string | undefined> = process.env,
  opts: { amountPaise?: number; description?: string } = {},
): Promise<RazorpayPaymentLink | null> {
  const cfg = razorpayConfig(env);
  if (!cfg) return null;
  const amount = Math.max(opts.amountPaise ?? 24_900, 100);
  const created = await postJson<RazorpayPaymentLink>(cfg, "/payment_links", {
    amount,
    currency: "INR",
    accept_partial: false,
    description: opts.description ?? "ReconAI close-loop payment",
    reference_id: `reconai_${Date.now()}`,
    expire_by: Math.floor(Date.now() / 1000) + 60 * 60,
    notify: { sms: false, email: false },
    reminder_enable: false,
  });
  return {
    id: created.id,
    short_url: created.short_url,
    amount: created.amount,
    status: created.status,
  };
}

interface ListEnvelope<T> {
  items?: T[];
  count?: number;
}

export interface RazorpayPull {
  payments: RazorpayPayment[];
  settlements: RazorpaySettlement[];
  refunds: RazorpayRefund[];
  disputes: RazorpayDispute[];
  recon: RazorpayReconItem[];
}

export async function pullRazorpayBatch(
  env: Record<string, string | undefined> = process.env,
  opts: { count?: number } = {},
): Promise<RazorpayPull | null> {
  const cfg = razorpayConfig(env);
  if (!cfg) return null;
  const count = Math.min(Math.max(opts.count ?? 100, 1), 100);
  const [payments, settlements, refunds, disputes] = await Promise.all([
    getJson<ListEnvelope<RazorpayPayment>>(cfg, `/payments?count=${count}`),
    getJson<ListEnvelope<RazorpaySettlement>>(cfg, `/settlements?count=${count}`),
    getJson<ListEnvelope<RazorpayRefund>>(cfg, `/refunds?count=${count}`),
    getJson<ListEnvelope<RazorpayDispute>>(cfg, `/disputes?count=${count}`).catch(() => ({
      items: [] as RazorpayDispute[],
    })),
  ]);

  const recon: RazorpayReconItem[] = [];
  for (const setl of settlements.items ?? []) {
    try {
      const dump = await getJson<ListEnvelope<RazorpayReconItem>>(cfg, `/settlements/recon/${setl.id}`);
      recon.push(...(dump.items ?? []));
    } catch {
      // recon is optional — older test accounts / permissions may 404
    }
  }

  return {
    payments: payments.items ?? [],
    settlements: settlements.items ?? [],
    refunds: refunds.items ?? [],
    disputes: disputes.items ?? [],
    recon,
  };
}
