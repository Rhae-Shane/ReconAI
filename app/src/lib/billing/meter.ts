/**
 * SaaS metering for ReconAI itself (closes + ingested rows per org).
 */

import { defaultCloseOrgId, orgDisplayName } from "@/lib/close/org";
import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

export type PlanId = "starter" | "growth" | "scale";

export interface Plan {
  id: PlanId;
  name: string;
  includedCloses: number;
  includedRows: number;
  pricePaisePerMonth: number;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: { id: "starter", name: "Starter", includedCloses: 30, includedRows: 10_000, pricePaisePerMonth: 0 },
  growth: { id: "growth", name: "Growth", includedCloses: 200, includedRows: 100_000, pricePaisePerMonth: 49_900_00 },
  scale: { id: "scale", name: "Scale", includedCloses: 2_000, includedRows: 2_000_000, pricePaisePerMonth: 199_900_00 },
};

export interface UsageEvent {
  orgId: string;
  kind: "close" | "upload_rows" | "gst_file" | "journal_post";
  quantity: number;
  at: string;
  runId?: string;
}

const USAGE_KEY = redisKey("billing", "usage");
const PLAN_KEY = redisKey("billing", "plan");

export function currentPlanId(): PlanId {
  const raw = process.env.RECONAI_PLAN?.trim().toLowerCase();
  if (raw === "starter" || raw === "growth" || raw === "scale") return raw;
  return "growth";
}

export async function getPlan(orgId = defaultCloseOrgId()): Promise<Plan> {
  const stored = await jsonGet<{ orgId: string; planId: PlanId }>(PLAN_KEY);
  const id = stored?.orgId === orgId ? stored.planId : currentPlanId();
  return PLANS[id] ?? PLANS.growth;
}

export async function setPlan(planId: PlanId, orgId = defaultCloseOrgId()): Promise<boolean> {
  return jsonSet(PLAN_KEY, { orgId, planId });
}

export async function recordUsage(event: Omit<UsageEvent, "at" | "orgId"> & { orgId?: string }): Promise<boolean> {
  const entry: UsageEvent = {
    orgId: event.orgId ?? defaultCloseOrgId(),
    kind: event.kind,
    quantity: event.quantity,
    runId: event.runId,
    at: new Date().toISOString(),
  };
  const list = (await jsonGet<UsageEvent[]>(USAGE_KEY)) ?? [];
  return jsonSet(USAGE_KEY, [entry, ...list].slice(0, 500));
}

export interface UsageSummary {
  orgId: string;
  orgName: string;
  plan: Plan;
  period: string;
  closes: number;
  rows: number;
  gstFilings: number;
  journalPosts: number;
  overageCloses: number;
  overageRows: number;
  events: UsageEvent[];
}

export async function usageSummary(orgId = defaultCloseOrgId()): Promise<UsageSummary> {
  const plan = await getPlan(orgId);
  const all = (await jsonGet<UsageEvent[]>(USAGE_KEY)) ?? [];
  const month = new Date().toISOString().slice(0, 7);
  const events = all.filter((e) => e.orgId === orgId && e.at.startsWith(month));
  const sum = (kind: UsageEvent["kind"]) => events.filter((e) => e.kind === kind).reduce((a, e) => a + e.quantity, 0);
  const closes = sum("close");
  const rows = sum("upload_rows");
  return {
    orgId,
    orgName: orgDisplayName(),
    plan,
    period: month,
    closes,
    rows,
    gstFilings: sum("gst_file"),
    journalPosts: sum("journal_post"),
    overageCloses: Math.max(0, closes - plan.includedCloses),
    overageRows: Math.max(0, rows - plan.includedRows),
    events: events.slice(0, 40),
  };
}
