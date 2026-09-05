"use client";

import type { ReactNode } from "react";

import { Check, TriangleAlert } from "lucide-react";

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
import { formatPaise } from "@/lib/close/config";
import { activeSignalLabels, type MatchExplanation } from "@/lib/close/explain";

function Row({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={mono ? "text-right font-medium tabular-nums" : "text-right font-medium"}>{value}</span>
    </div>
  );
}

function ConfidenceTone({ value }: { value: number }) {
  const pct = `${(value * 100).toFixed(0)}%`;
  let tone = "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300";
  if (value >= 0.95) {
    tone = "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300";
  } else if (value >= 0.8) {
    tone = "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300";
  }
  return (
    <Badge variant="outline" className={tone}>
      {pct}
    </Badge>
  );
}

function DeterministicBody({ expl }: { expl: MatchExplanation }) {
  const hasNetting = expl.grossPaise !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
        <Row label="Method" value={<Badge variant="secondary">{expl.method}</Badge>} />
        <Row label="Invoice / key" value={expl.invoiceRef} />
        {hasNetting && (
          <>
            <Separator className="my-1" />
            <Row label="Gross" value={formatPaise(expl.grossPaise ?? 0)} mono />
            <Row label="Fee" value={formatPaise(expl.feePaise ?? 0)} mono />
            <Row label="GST on Fee" value={formatPaise(expl.taxOnFeePaise ?? 0)} mono />
            {(expl.refundPaise ?? 0) > 0 && <Row label="Refund" value={formatPaise(expl.refundPaise ?? 0)} mono />}
            {(expl.adjustmentPaise ?? 0) !== 0 && (
              <Row label="Adjustment" value={formatPaise(expl.adjustmentPaise ?? 0)} mono />
            )}
            <Separator className="my-1" />
            <Row label="Expected" value={formatPaise(expl.expectedPaise ?? 0)} mono />
            <Row label="Settlement" value={formatPaise(expl.settlementPaise ?? 0)} mono />
            <Row label="Difference" value={formatPaise(expl.differencePaise ?? 0)} mono />
          </>
        )}
        <Separator className="my-1" />
        <Row label="Confidence" value={<ConfidenceTone value={expl.confidence} />} />
        <Row label="AI Used" value="No" />
        {expl.reason && (
          <div className="pt-1">
            <p className="mb-1 font-medium text-foreground/60 text-xs uppercase">Reason</p>
            <p className="text-muted-foreground text-sm">{expl.reason}</p>
          </div>
        )}
      </div>

      {expl.linkedRefs.length > 0 && (
        <div>
          <p className="mb-2 font-medium text-foreground/60 text-xs uppercase">Linked records</p>
          <ul className="flex flex-col gap-1.5">
            {expl.linkedRefs.map((r) => (
              <li
                key={`${r.recordId}:${r.matchedOn}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <span className="truncate font-medium">{r.sourceRef}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Badge variant="outline" className="font-normal">
                    {r.kind}
                  </Badge>
                  <span className="tabular-nums">{r.matchedOn}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AiBody({ expl }: { expl: MatchExplanation }) {
  const signals = activeSignalLabels(expl.signals);
  const failedLabels: Record<string, string> = {
    EXACT: "Exact match failed",
    NORMALIZED: "Normalized match failed",
    FEE_NETTING: "Fee netting failed",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
        <ul className="flex flex-col gap-1.5 text-sm">
          {expl.failedStages.map((stage) => (
            <li key={stage} className="flex items-center gap-2">
              <Check className="size-3.5 shrink-0 text-green-700 dark:text-green-300" aria-hidden />
              <span>{failedLabels[stage] ?? stage}</span>
            </li>
          ))}
        </ul>

        <Separator className="my-1" />

        <div>
          <p className="mb-1.5 font-medium text-foreground/60 text-xs uppercase">Candidate signals</p>
          <div className="flex flex-wrap gap-1.5">
            {signals.length ? (
              signals.map((s) => (
                <Badge key={s} variant="outline" className="font-normal">
                  {s}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground text-sm">None detected</span>
            )}
          </div>
        </div>

        <Separator className="my-1" />

        <Row
          label="AI Verdict"
          value={
            <Badge
              variant="outline"
              className="border-violet-700/25 text-violet-700 dark:border-violet-300/25 dark:text-violet-300"
            >
              {expl.verdict ?? "MATCHED"}
            </Badge>
          }
        />
        <Row label="Confidence" value={<ConfidenceTone value={expl.confidence} />} />
        <Row label="Method" value={<Badge variant="secondary">{expl.method}</Badge>} />
        <Row label="Invoice / key" value={expl.invoiceRef} />

        {expl.reason && (
          <div className="pt-1">
            <p className="mb-1 font-medium text-foreground/60 text-xs uppercase">Reason</p>
            <p className="text-muted-foreground text-sm">{expl.reason}</p>
          </div>
        )}
      </div>

      {expl.humanReviewRequired && (
        <div className="flex items-start gap-2 rounded-lg border border-yellow-700/25 bg-yellow-500/5 px-3 py-2.5 text-sm text-yellow-800 dark:text-yellow-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Human review required — confidence below threshold or AI-resolved with review flag.</span>
        </div>
      )}

      {expl.provenance && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p className="font-medium text-foreground/60 text-xs uppercase tracking-wide">Decision Trace</p>
          <Row label="Engine" value="Deterministic → AI Judge" />
          <Row label="Model" value={expl.provenance.model} />
          <Row label="Prompt" value={expl.provenance.promptVersion} />
          <Row
            label="Decision ID"
            value={<span className="font-mono text-xs">{expl.provenance.decisionId.slice(0, 12)}…</span>}
          />
          <Row
            label="Input hash"
            value={<span className="font-mono text-xs">{expl.provenance.inputHash.slice(0, 12)}…</span>}
          />
          <Row label="Confidence" value={<ConfidenceTone value={expl.provenance.confidence} />} />
          <Row label="Human review" value={expl.provenance.humanReviewRequired ? "Required" : "Not required"} />
        </div>
      )}

      {expl.linkedRefs.length > 0 && (
        <div>
          <p className="mb-2 font-medium text-foreground/60 text-xs uppercase">Linked records</p>
          <ul className="flex flex-col gap-1.5">
            {expl.linkedRefs.map((r) => (
              <li
                key={`${r.recordId}:${r.matchedOn}`}
                className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <span className="truncate font-medium">{r.sourceRef}</span>
                <Badge variant="outline" className="font-normal">
                  {r.kind}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function MatchExplanationDrawer({
  explanation,
  open,
  onOpenChange,
}: {
  explanation: MatchExplanation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isAi = explanation?.kind === "ai";

  return (
    <Drawer open={open && explanation !== null} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2">
            {isAi ? "Why was AI used?" : "Why was this matched?"}
            {explanation && (
              <Badge variant="outline" className="font-normal">
                {explanation.method}
              </Badge>
            )}
          </DrawerTitle>
          <DrawerDescription>
            {isAi
              ? "Deterministic cascade failed — residual judgment decided this group."
              : "Rules and/or fee netting produced this match without an LLM call."}
          </DrawerDescription>
        </DrawerHeader>

        {explanation && (
          <div className="px-4 pb-2">
            {isAi ? <AiBody expl={explanation} /> : <DeterministicBody expl={explanation} />}
          </div>
        )}

        <DrawerFooter className="flex-row justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
