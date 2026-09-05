/**
 * Slack / email digest of open exceptions for the current close.
 */

import { orgDisplayName } from "@/lib/close/org";
import type { ExceptionRecord } from "@/lib/close/types";
import { emitEvent } from "@/lib/events";
import { formatPaise } from "@/lib/close/config";

export interface ExceptionDigest {
  org: string;
  runId: string;
  open: number;
  byCode: Record<string, number>;
  lines: Array<{ id: string; reasonCode: string; rationale: string; amount: string }>;
  subject: string;
  text: string;
}

export function buildExceptionDigest(runId: string, exceptions: ExceptionRecord[]): ExceptionDigest {
  const open = exceptions.filter((e) => e.status === "OPEN");
  const byCode: Record<string, number> = {};
  for (const e of open) byCode[e.reasonCode] = (byCode[e.reasonCode] ?? 0) + 1;
  const org = orgDisplayName();
  const lines = open.slice(0, 25).map((e) => ({
    id: e.id,
    reasonCode: e.reasonCode,
    rationale: e.rationale,
    amount: formatPaise(e.actualPaise ?? e.variancePaise ?? 0),
  }));
  const subject = `${org} close ${runId}: ${open.length} open exception${open.length === 1 ? "" : "s"}`;
  const text = [
    subject,
    "",
    ...Object.entries(byCode).map(([code, n]) => `  ${code}: ${n}`),
    "",
    ...lines.map((l) => `  - ${l.id} [${l.reasonCode}] ${l.amount} — ${l.rationale}`),
    open.length > lines.length ? `  … ${open.length - lines.length} more` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { org, runId, open: open.length, byCode, lines, subject, text };
}

export async function sendExceptionDigest(runId: string, exceptions: ExceptionRecord[]): Promise<ExceptionDigest> {
  const digest = buildExceptionDigest(runId, exceptions);
  await emitEvent({
    type: "alert",
    runId,
    detail: {
      kind: "exceptions.digest",
      subject: digest.subject,
      open: digest.open,
      byCode: digest.byCode,
      text: digest.text,
    },
  });
  return digest;
}
