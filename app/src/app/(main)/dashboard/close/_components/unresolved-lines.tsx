import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPaise } from "@/lib/close/config";
import type { ReasonCode, UnresolvedLine } from "@/lib/close/types";

const REASON_TONES: Record<ReasonCode, string> = {
  NO_KEY: "border-slate-600/40 text-slate-700 dark:border-slate-300/40 dark:text-slate-300",
  AMOUNT_MISMATCH: "border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300",
  PARTIAL_FLAP: "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300",
  DATE_SKEW: "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300",
  LOW_CONFIDENCE: "border-orange-700/25 text-orange-700 dark:border-orange-300/25 dark:text-orange-300",
  DUPLICATE: "border-purple-700/25 text-purple-700 dark:border-purple-300/25 dark:text-purple-300",
  UNKNOWN_SOURCE: "border-slate-600/40 text-slate-700 dark:border-slate-300/40 dark:text-slate-300",
};

function ConfidenceBadge({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  const tone =
    value >= 0.95
      ? "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
      : value >= 0.8
        ? "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300"
        : "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300";
  return (
    <Badge variant="outline" className={tone}>
      {pct}%
    </Badge>
  );
}

function DifferenceCell({ value }: { value: number }) {
  return (
    <span
      className={
        value === 0 ? "text-muted-foreground tabular-nums" : "text-yellow-700 tabular-nums dark:text-yellow-300"
      }
    >
      {formatPaise(value)}
    </span>
  );
}

function StatusBadge({ status }: { status: UnresolvedLine["status"] }) {
  if (status === "NEEDS_REVIEW") {
    return (
      <Badge variant="outline" className="border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300">
        Needs human review
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
    >
      Resolved
    </Badge>
  );
}

const HEADERS = ["Ref", "Expected (₹)", "Settlement (₹)", "Difference (₹)", "Reason", "Confidence", "Status"];

/**
 * Per-record unresolved breakdown, aligned to `CloseReport.unresolved`.
 *
 * `lines === undefined` means the report artifact does not yet carry the field
 * (store is mid-flight) — rendered as a graceful "not yet available" placeholder.
 * An empty array renders an explicit "nothing unresolved" empty state.
 */
export function UnresolvedLines({
  lines,
  title = "Unresolved breakdown",
  description,
}: {
  lines: UnresolvedLine[] | undefined;
  title?: string;
  description?: string;
}) {
  const available = lines != null;
  const count = lines?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">{title}</CardTitle>
        <CardDescription>
          {description ??
            (available
              ? "Per-record outcome: expected vs settlement with the residual reason"
              : "Outcome per unresolved record is not yet emitted for this run")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!available ? (
          <p className="text-muted-foreground text-sm">Unresolved breakdown not yet available for this run.</p>
        ) : count === 0 ? (
          <p className="text-muted-foreground text-sm">No unresolved records — everything reconciled cleanly.</p>
        ) : (
          <Table className="w-full border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent [&>:not(:last-child)]:border-r">
                {HEADERS.map((h) => (
                  <TableHead key={h} className="h-10 px-4 font-medium text-muted-foreground text-sm">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lines ?? []).map((line) => (
                <TableRow key={line.recordId} className="h-12 hover:bg-muted/20 [&>:not(:last-child)]:border-r">
                  <TableCell className="px-4 align-middle">
                    <span className="font-medium">{line.ref}</span>
                  </TableCell>
                  <TableCell className="px-4 align-middle tabular-nums">{formatPaise(line.expectedPaise)}</TableCell>
                  <TableCell className="px-4 align-middle tabular-nums">{formatPaise(line.actualPaise)}</TableCell>
                  <TableCell className="px-4 align-middle">
                    <DifferenceCell value={line.differencePaise} />
                  </TableCell>
                  <TableCell className="px-4 align-middle">
                    <Badge variant="outline" className={REASON_TONES[line.reason] ?? "border-border text-foreground"}>
                      {line.reason}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 align-middle">
                    <ConfidenceBadge value={line.confidence} />
                  </TableCell>
                  <TableCell className="px-4 align-middle">
                    <StatusBadge status={line.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
