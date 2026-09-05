"use client";

import { useCallback, useEffect, useState } from "react";

import { Mail, Paperclip, ShieldAlert, Stamp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { formatPaise } from "@/lib/close/config";
import type { ExceptionRecord, UnresolvedLine } from "@/lib/close/types";
import { reconcileUnresolvedWithExceptions } from "@/lib/close/unresolved-sync";
import type { EvidenceRef } from "@/lib/finance/evidence";

import { UnresolvedLines } from "../_components/unresolved-lines";
import { ExceptionsTable } from "./_components/exceptions-table";
import { ReasonCodeChart } from "./_components/reason-code-chart";
import { TrustGateBanner } from "./_components/trust-gate-banner";

interface WorkflowView {
  requestId: string;
  state: string;
  requiredApprovals: number;
  approvedBy: string[];
  requestedBy?: string;
  evidence: EvidenceRef[];
}

/** Distinct demo actors for SoD — submitter must never equal approver. */
const DEMO_ACCOUNTANT = "accountant.demo";
const DEMO_OWNER = "owner.demo";

function WorkflowBadge({ state }: { state?: string }) {
  if (!state) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Not submitted
      </Badge>
    );
  }
  let tone = "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300";
  if (state === "APPROVED" || state === "POSTED") {
    tone = "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300";
  } else if (state === "REJECTED") {
    tone = "border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300";
  }
  return (
    <Badge variant="outline" className={tone}>
      <span className="size-1.5 rounded-full bg-current" />
      {state}
    </Badge>
  );
}

/** One exception row: attach evidence + drive the approval workflow for the adjustment. */
function ExceptionEvidenceRow({ exception }: { exception: ExceptionRecord }) {
  const [label, setLabel] = useState("");
  const [ref, setRef] = useState("");
  const [evidence, setEvidence] = useState<EvidenceRef[]>([]);
  const [flow, setFlow] = useState<WorkflowView | null>(null);
  const [busy, setBusy] = useState(false);

  const amountPaise = exception.actualPaise ?? exception.expectedPaise ?? exception.variancePaise ?? 0;

  const loadEvidence = useCallback(async () => {
    try {
      const res = await fetch(`/api/close/exceptions/${exception.id}/evidence`);
      const data = (await res.json()) as { evidence: EvidenceRef[] };
      setEvidence(data.evidence);
    } catch {
      /* no-op: keep last known list */
    }
  }, [exception.id]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  async function attachEvidence() {
    if (!label.trim() || !ref.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/close/exceptions/${exception.id}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), ref: ref.trim() }),
      });
      if (!res.ok) throw new Error("attach failed");
      const data = (await res.json()) as { evidence: EvidenceRef[] };
      setEvidence(data.evidence);
      setLabel("");
      setRef("");
      toast.success("Evidence attached");
    } catch {
      toast.error("Could not attach evidence.");
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow(action: "submit" | "approve") {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        action,
        actor: action === "submit" ? DEMO_ACCOUNTANT : DEMO_OWNER,
      };
      if (action === "submit") {
        Object.assign(body, {
          runId: exception.runId,
          type: "adjustment",
          amountPaise,
          requestedBy: DEMO_ACCOUNTANT,
        });
      } else {
        if (!flow?.requestId) {
          toast.error("Submit the adjustment for approval first.");
          return;
        }
        Object.assign(body, {
          requestId: flow.requestId,
          runId: exception.runId,
          type: "adjustment",
          amountPaise,
          requestedBy: flow.requestedBy ?? DEMO_ACCOUNTANT,
          approvedBy: flow.approvedBy ?? [],
        });
      }
      const res = await fetch("/api/control/approvals/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as WorkflowView & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "workflow failed");
      setFlow({
        ...data,
        requestedBy: data.requestedBy ?? (action === "submit" ? DEMO_ACCOUNTANT : flow?.requestedBy),
      });
      toast.success(
        action === "submit"
          ? `Submitted by ${DEMO_ACCOUNTANT} for approval`
          : `Approved by ${DEMO_OWNER}`,
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const approvals = (flow?.approvedBy ?? []).length;
  const needed = flow?.requiredApprovals ?? 1;
  const done = flow?.state === "APPROVED" || flow?.state === "POSTED";

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-medium">{exception.id}</span>
              <Badge variant="outline">{exception.reasonCode}</Badge>
            </div>
            <span className="text-muted-foreground text-xs">
              Adjustment {formatPaise(amountPaise)} · {approvals}/{needed} approvals
            </span>
          </div>
          <div className="flex items-center gap-2">
            <WorkflowBadge state={flow?.state} />
            <Button
              size="sm"
              variant="outline"
              disabled={busy || done}
              onClick={() => runWorkflow("submit")}
              title={`Submit as ${DEMO_ACCOUNTANT} (SoD: cannot also approve)`}
            >
              Submit
            </Button>
            <Button
              size="sm"
              disabled={busy || done || !flow?.requestId}
              onClick={() => runWorkflow("approve")}
              title={`Approve as ${DEMO_OWNER} (must ≠ ${DEMO_ACCOUNTANT})`}
            >
              Approve
            </Button>
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Paperclip className="size-4 text-muted-foreground" />
          <Input
            placeholder="Label (e.g. GST 2B proof)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 max-w-44"
          />
          <Input
            placeholder="Ref / URL / doc-id"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className="h-8 max-w-56"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !label.trim() || !ref.trim()}
            onClick={attachEvidence}
          >
            Attach
          </Button>
          {evidence.map((ev) => (
            <Badge key={ev.id} variant="outline" className="text-muted-foreground">
              {ev.label}: {ev.ref}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceApprovalPanel({ exceptions }: { exceptions: ExceptionRecord[] }) {
  const open = exceptions.filter((e) => e.status === "OPEN");
  if (open.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-normal">
          <Stamp className="size-4 text-muted-foreground" />
          Evidence &amp; approval
        </CardTitle>
        <CardDescription>
          Attach proof to an open exception and drive the approval workflow. Segregation of duties:
          submit as <span className="font-medium text-foreground">{DEMO_ACCOUNTANT}</span>, approve as{" "}
          <span className="font-medium text-foreground">{DEMO_OWNER}</span> — the same actor can never do
          both. Material variances still need dual approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {open.map((exc) => (
          <ExceptionEvidenceRow key={exc.id} exception={exc} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function ExceptionsPage() {
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [unresolved, setUnresolved] = useState<UnresolvedLine[]>([]);

  useEffect(() => {
    void Promise.all([
      fetch("/api/close/exceptions?runId=run_today").then(
        (r) => r.json() as Promise<{ exceptions?: ExceptionRecord[] }>,
      ),
      fetch("/api/close/runs/run_today/report")
        .then((res) => res.json() as Promise<{ unresolved?: UnresolvedLine[]; exceptions?: ExceptionRecord[] }>)
        .catch(() => ({ unresolved: [] as UnresolvedLine[], exceptions: [] as ExceptionRecord[] })),
    ]).then(([excBody, report]) => {
      const live = excBody.exceptions ?? [];
      // Prefer live ledger; fall back to report.exceptions when the list endpoint is empty
      // but the rebuilt report still carries the honest residual set.
      const merged =
        live.length > 0
          ? live
          : (report.exceptions ?? []).filter((e) => e.status === "OPEN" || e.status === "REVIEWED");
      setExceptions(merged);
      setUnresolved(report.unresolved ?? []);
    });
  }, []);

  // Live ledger is source of truth. A frozen report must not keep "Needs human review"
  // (or a giant residual table) after the exception queue is empty — that reads as broken.
  const displayUnresolved =
    exceptions.length === 0
      ? []
      : reconcileUnresolvedWithExceptions(unresolved, exceptions);
  const open = exceptions.filter((e) => e.status === "OPEN").length;
  const needsReview = displayUnresolved.filter((u) => u.status === "NEEDS_REVIEW").length;
  const gateOpen = Math.max(open, needsReview);

  async function sendDigest() {
    const res = await fetch("/api/close/digest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ runId: "run_today" }),
    });
    const body = (await res.json()) as { error?: string; digest?: { open: number }; delivered?: boolean };
    if (!res.ok) {
      toast.error(body.error ?? "Digest failed");
      return;
    }
    toast.success(
      body.delivered
        ? `Sent digest (${body.digest?.open ?? open} open)`
        : `Digest built (${body.digest?.open ?? open} open) — set EMAIL_WEBHOOK_URL to deliver`,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-3xl tracking-tight">Exceptions</h1>
          <p className="text-muted-foreground text-sm">
            The honest list - every unresolved record, with a reason code and rationale. Never deleted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void sendDigest()}>
            <Mail className="size-4" />
            Email / Slack digest
          </Button>
          <Card className="flex items-center gap-2 px-4 py-2">
            <ShieldAlert className="size-4 text-destructive" />
            <CardContent className="p-0 text-sm">
              <span className="font-medium tabular-nums">{open}</span>{" "}
              <span className="text-muted-foreground">open of {exceptions.length}</span>
            </CardContent>
          </Card>
        </div>
      </div>

      <TrustGateBanner openExceptions={gateOpen} />

      <UnresolvedLines lines={displayUnresolved} title="Unresolved detail" />

      <EvidenceApprovalPanel exceptions={exceptions} />

      <ReasonCodeChart exceptions={exceptions} />

      <ExceptionsTable initial={exceptions} onChange={setExceptions} />
    </div>
  );
}
