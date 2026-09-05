import type { CloseReport, FinRecord } from "@/lib/close/types";
import { runFromUpload } from "@/lib/close/store";

import { pullRazorpayBatch } from "./client";
import { inboxTake } from "./inbox";
import { applyRecon, fillTestModeBankLegs, mapDispute, mapPayment, mapRefund, mapSettlement } from "./map";

export interface RazorpaySyncResult {
  mode: "test" | "live" | "inbox-only";
  runId: string;
  report: CloseReport;
  counts: {
    payments: number;
    settlements: number;
    refunds: number;
    inbox: number;
    records: number;
  };
}

function mergeRecords(...lists: FinRecord[][]): FinRecord[] {
  const byId = new Map<string, FinRecord>();
  for (const list of lists) {
    for (const rec of list) byId.set(rec.id, rec);
  }
  return [...byId.values()];
}

export async function collectRazorpayRecords(
  env: Record<string, string | undefined> = process.env,
): Promise<{ records: FinRecord[]; pulled: Awaited<ReturnType<typeof pullRazorpayBatch>>; inbox: number } | { error: "empty" | "unconfigured" }> {
  const pulled = await pullRazorpayBatch(env);
  const inbox = inboxTake();

  if (!pulled && inbox.length === 0) {
    return { error: pulled === null ? "unconfigured" : "empty" };
  }

  const fromApi: FinRecord[] = [];
  if (pulled) {
    for (const p of pulled.payments) fromApi.push(...mapPayment(p));
    for (const s of pulled.settlements) fromApi.push(...mapSettlement(s));
    for (const r of pulled.refunds) fromApi.push(...mapRefund(r));
    for (const d of pulled.disputes) fromApi.push(...mapDispute(d));
  }

  const stamped = pulled ? applyRecon([...fromApi, ...inbox], pulled.recon) : [...fromApi, ...inbox];
  const keyId = env.RAZORPAY_KEY_ID?.trim() ?? "";
  const live = keyId.startsWith("rzp_live_");
  const records = fillTestModeBankLegs(mergeRecords(stamped), {
    testMode: Boolean(pulled) && !live,
    realSettlementCount: pulled?.settlements.length ?? 0,
  });
  if (records.length === 0) return { error: "empty" };
  return { records, pulled, inbox: inbox.length };
}

/** Pull Razorpay test-mode data (when keys exist) + flush the webhook inbox into a close run. */
export async function syncRazorpayClose(
  env: Record<string, string | undefined> = process.env,
): Promise<RazorpaySyncResult | { error: "empty" } | { error: "unconfigured" }> {
  const collected = await collectRazorpayRecords(env);
  if ("error" in collected) return collected;

  const { runId, report } = runFromUpload(collected.records);
  const { persistCloseArtifacts } = await import("@/lib/close/store");
  await persistCloseArtifacts(runId, report);
  const keyId = env.RAZORPAY_KEY_ID?.trim() ?? "";
  const live = keyId.startsWith("rzp_live_");
  return {
    mode: collected.pulled ? (live ? "live" : "test") : "inbox-only",
    runId,
    report,
    counts: {
      payments: collected.pulled?.payments.length ?? 0,
      settlements: collected.pulled?.settlements.length ?? 0,
      refunds: collected.pulled?.refunds.length ?? 0,
      inbox: collected.inbox,
      records: collected.records.length,
    },
  };
}
