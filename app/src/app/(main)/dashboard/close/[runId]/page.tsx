import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { format, parseISO } from "date-fns";
import { CheckCircle2, FileSpreadsheet, FileText, FileType2, PenLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authorizeRole, currentUserRole, requireRole } from "@/lib/authz";
import { ensureLiveClose, getReportFromStore, getRunFromStore } from "@/lib/close/store";
import { loadSignOff, saveSignOff } from "@/lib/finance/signoff";
import { createClient } from "@/lib/supabase/server";

import { UnresolvedLines } from "../_components/unresolved-lines";
import { ConfidenceDistribution } from "./_components/confidence-distribution";
import { DeterminismKpis } from "./_components/determinism-kpis";
import { ReconciliationGrid } from "./_components/reconciliation-grid";
import { RunDetailKpis } from "./_components/run-detail-kpis";
import { RunProgress } from "./_components/run-progress";
import { RunTrace } from "./_components/run-trace";
import { SourceBreakdown } from "./_components/source-breakdown";

/**
 * Record the acting accountant/owner's sign-off for a completed close run (Workstream A).
 * Runs server-side with the request cookies; only owner/accountant may sign off a close.
 */
async function signOffClose(runId: string): Promise<void> {
  "use server";
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await saveSignOff(runId, {
    runId,
    by: user?.email ?? verdict.role,
    at: new Date().toISOString(),
    role: verdict.role,
  });
  revalidatePath(`/dashboard/close/${runId}`);
}

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  await ensureLiveClose();
  const run = await getRunFromStore(runId);
  if (!run) return notFound();
  const report = await getReportFromStore(runId);

  // Role + current sign-off for the Close Dossier panel. Fail-open (no crash) when Supabase
  // or Redis is unconfigured - the panel simply hides the sign-off control.
  let role = null as Awaited<ReturnType<typeof currentUserRole>>;
  try {
    role = await currentUserRole();
  } catch {
    role = null;
  }
  const signOff = await loadSignOff(runId);
  const canSign = authorizeRole(role, ["owner", "accountant"]);

  function runStatusBadge(status: string) {
    if (status === "RUNNING") {
      return (
        <Badge
          variant="outline"
          className="border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-current" />
          Running
        </Badge>
      );
    }
    if (status === "DONE") {
      return (
        <Badge
          className="border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
          variant="outline"
        >
          <span className="size-1.5 rounded-full bg-current" />
          Done
        </Badge>
      );
    }
    return <Badge variant="destructive">Failed</Badge>;
  }

  const title = (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl tracking-tight">{run.meta.id}</h1>
        {runStatusBadge(run.meta.status)}
      </div>
      <p className="text-muted-foreground text-sm">
        Started {format(parseISO(run.meta.startedAt), "d MMM yyyy, HH:mm")} · {run.meta.batchRef} · 4 sources
      </p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {title}

      {run.meta.status === "RUNNING" && <RunProgress run={run.meta} />}
      {run.meta.status === "FAILED" && (
        <Card>
          <CardHeader>
            <CardTitle className="font-normal">Run failed</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            This close run aborted before producing a report. Start a new run to retry.
          </CardContent>
        </Card>
      )}

      {run.meta.status === "DONE" && (
        <>
          <RunDetailKpis run={run} breakdown={report?.breakdown} />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <DeterminismKpis run={run} />
            </div>
            <div className="xl:col-span-5">
              <RunTrace run={run} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5">
              <ConfidenceDistribution run={run} />
            </div>
            <div className="xl:col-span-7">
              <SourceBreakdown sources={run.sources} />
            </div>
          </div>

          <ReconciliationGrid run={run} />

          <UnresolvedLines lines={report?.unresolved} title="Unresolved breakdown" />

          <Card>
            <CardHeader>
              <CardTitle className="font-normal">Close Dossier</CardTitle>
              <CardDescription>
                Audit-ready snapshot of this close run - export it for the books or sign it off.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`/api/finance/dossier/${runId}/export?format=pdf`}>
                  <FileText data-icon="inline-start" />
                  PDF
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`/api/finance/dossier/${runId}/export?format=xlsx`}>
                  <FileSpreadsheet data-icon="inline-start" />
                  Excel
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`/api/finance/dossier/${runId}/export?format=csv`}>
                  <FileType2 data-icon="inline-start" />
                  CSV
                </a>
              </Button>

              {signOff ? (
                <Badge
                  variant="outline"
                  className="ml-auto border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
                >
                  <CheckCircle2 />
                  Signed off by {signOff.by} ({signOff.role})
                </Badge>
              ) : (
                <div className="ml-auto flex items-center gap-3">
                  <span className="text-muted-foreground text-sm">Not signed off yet</span>
                  {canSign && (
                    <form action={signOffClose.bind(null, runId)}>
                      <Button type="submit" size="sm" variant="secondary">
                        <PenLine data-icon="inline-start" />
                        Sign off this close
                      </Button>
                    </form>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
