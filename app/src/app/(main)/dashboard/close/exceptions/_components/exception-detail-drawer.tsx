"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Separator } from "@/components/ui/separator";
import type { ExceptionRecord } from "@/lib/close/types";

/** Demo actors for SoD — distinct identities so submit ≠ approve. */
const DEMO_ACCOUNTANT = "accountant.demo";
const DEMO_OWNER = "owner.demo";

const REASON_HELP: Record<ExceptionRecord["reasonCode"], string> = {
  NO_KEY: "No deterministic key (gateway ref / UTR / invoice no) found in another source.",
  AMOUNT_MISMATCH: "Amount differs from the closest candidate by more than the ₹0.50 tolerance.",
  PARTIAL_FLAP: "Nearly matched multiple records; none bound cleanly to a single group.",
  DATE_SKEW: "Value dates fall outside the allowed 1-day window.",
  LOW_CONFIDENCE: "Residual judgment confidence below the 0.70 resolve threshold.",
  DUPLICATE: "Same source reference appears more than once in the batch.",
  UNKNOWN_SOURCE: "Record source could not be attributed to a known import.",
};

function ResolutionBadge({ exception }: { exception: ExceptionRecord }) {
  const rs = exception.resolutionStatus ?? "OPEN";
  let tone = "border-slate-600/40 text-slate-700 dark:border-slate-300/40 dark:text-slate-300";
  if (rs === "PENDING_APPROVAL") {
    tone = "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300";
  } else if (rs === "APPROVED") {
    tone = "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300";
  } else if (rs === "REJECTED") {
    tone = "border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300";
  }
  return (
    <Badge variant="outline" className={tone}>
      {rs}
    </Badge>
  );
}

export function ExceptionDetailDrawer({
  exception,
  open,
  onOpenChange,
  onResolved,
}: {
  exception: ExceptionRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: (updated: ExceptionRecord) => void;
}) {
  const [busy, setBusy] = useState(false);

  const critical =
    Boolean(exception?.critical) ||
    exception?.reasonCode === "AMOUNT_MISMATCH" ||
    exception?.reasonCode === "DUPLICATE";
  const pending = exception?.resolutionStatus === "PENDING_APPROVAL";
  const fullyResolved = exception?.status === "RESOLVED" && exception?.resolutionStatus === "APPROVED";

  async function submitResolution() {
    if (!exception) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/close/exceptions/${exception.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          status: "RESOLVED",
          note: critical ? "accountant resolution submitted" : "accountant sign-off",
          actor: DEMO_ACCOUNTANT,
        }),
      });
      const data = (await res.json()) as { exception?: ExceptionRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "submit failed");
      toast.success(
        critical ? `Submitted by ${DEMO_ACCOUNTANT} — awaiting owner approval` : `Resolved by ${DEMO_ACCOUNTANT}`,
      );
      onResolved(data.exception!);
      if (!critical) onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not submit the resolution.");
    } finally {
      setBusy(false);
    }
  }

  async function approveResolution() {
    if (!exception) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/close/exceptions/${exception.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          note: "owner approval",
          actor: DEMO_OWNER,
        }),
      });
      const data = (await res.json()) as { exception?: ExceptionRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "approve failed");
      toast.success(`Approved by ${DEMO_OWNER} (SoD: ≠ ${exception.resolvedBy})`);
      onResolved(data.exception!);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not approve the resolution.");
    } finally {
      setBusy(false);
    }
  }

  async function override() {
    if (!exception) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/close/exceptions/${exception.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "OVERRIDDEN",
          note: "overridden by accountant",
          actor: DEMO_ACCOUNTANT,
        }),
      });
      const data = (await res.json()) as { exception?: ExceptionRecord; error?: string };
      if (!res.ok) throw new Error(data.error ?? "override failed");
      toast.success(`Exception ${data.exception?.id} marked OVERRIDDEN`);
      onResolved(data.exception!);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || "Could not override the exception.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open={open && exception !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader>
          <DrawerTitle className="flex flex-wrap items-center gap-2">
            {exception?.id}
            {exception && (
              <Badge
                variant="outline"
                className="border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300"
              >
                {exception.reasonCode}
              </Badge>
            )}
            {critical && (
              <Badge
                variant="outline"
                className="border-orange-700/25 text-orange-700 dark:border-orange-300/25 dark:text-orange-300"
              >
                Critical
              </Badge>
            )}
          </DrawerTitle>
          <DrawerDescription>
            {critical
              ? "Critical exception — accountant submits, owner approves (resolvedBy ≠ approvedBy)."
              : "Honest unresolved record — accountant may resolve alone when non-critical."}
          </DrawerDescription>
        </DrawerHeader>

        {exception && (
          <div className="flex flex-col gap-4 px-4 pb-2">
            <div className="flex flex-col gap-1 rounded-lg bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Record</span>
                <span className="font-medium">{exception.recordId ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline">{exception.status}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolution</span>
                <ResolutionBadge exception={exception} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Resolved by</span>
                <span className="font-medium">{exception.resolvedBy ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved by</span>
                <span className="font-medium">{exception.approvedBy ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Candidates for review</span>
                <span className="tabular-nums">{exception.candidateIds.length}</span>
              </div>
            </div>

            <div>
              <p className="mb-1 font-medium text-foreground/60 text-xs uppercase">What this means</p>
              <p className="text-muted-foreground text-sm">{REASON_HELP[exception.reasonCode]}</p>
            </div>

            <Separator />
            <p className="text-sm">{exception.rationale}</p>
          </div>
        )}

        <DrawerFooter className="flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            disabled={busy || fullyResolved || pending}
            onClick={submitResolution}
            title={critical ? `Submit as ${DEMO_ACCOUNTANT} → PENDING_APPROVAL` : `Resolve as ${DEMO_ACCOUNTANT}`}
          >
            Submit resolution
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={busy || !pending || fullyResolved}
            onClick={approveResolution}
            title={`Approve as ${DEMO_OWNER} (must ≠ resolvedBy)`}
          >
            Approve resolution
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || exception?.status === "OVERRIDDEN" || fullyResolved}
            onClick={override}
          >
            Override
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
