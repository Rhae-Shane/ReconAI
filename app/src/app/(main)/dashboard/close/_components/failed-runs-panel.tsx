"use client";

import { useCallback, useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { format, parseISO } from "date-fns";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";

interface FailedRun {
  runId: string;
  failedAt: string;
  reason: string;
  attempts: number;
}

const FAILED_THRESHOLD = 5;

function FailedRunRow({ run, onRetried }: { run: FailedRun; onRetried: (runId: string) => void }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch(`/api/close/runs/${encodeURIComponent(run.runId)}/retry`, {
        method: "POST",
      });
      if (res.status === 503) {
        toast.error("Retry unavailable - the close queue is not configured (no Redis).");
        return;
      }
      if (!res.ok) throw new Error("Retry failed");
      toast.success(`Re-enqueued close run ${run.runId} for retry.`);
      onRetried(run.runId);
      router.refresh();
    } catch {
      toast.error("Could not retry the close run.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 border-b py-2 last:border-b-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{run.runId}</span>
          <Badge variant="destructive">
            <span className="size-1.5 rounded-full bg-current" />
            Failed
          </Badge>
          <span className="text-muted-foreground text-xs tabular-nums">{run.attempts} attempt(s)</span>
        </div>
        <Button size="sm" variant="outline" onClick={handleRetry} disabled={retrying}>
          {retrying ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Retry
        </Button>
      </div>
      <p className="truncate text-muted-foreground text-xs" title={run.reason}>
        {run.reason}
      </p>
      <span className="text-muted-foreground text-xs tabular-nums">
        {format(parseISO(run.failedAt), "d MMM yyyy, HH:mm")}
      </span>
    </div>
  );
}

export function FailedRunsPanel() {
  const [failed, setFailed] = useState<FailedRun[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/close/runs/failed");
      if (!res.ok) throw new Error("Failed to load");
      const data = (await res.json()) as { failed: FailedRun[] };
      setFailed(data.failed);
    } catch {
      setFailed([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 font-normal text-muted-foreground text-sm">
          <TriangleAlert className="size-4" />
          Failed runs
          {failed.length > 0 && <Badge variant="destructive">{failed.length}</Badge>}
        </CardTitle>
        <Button size="xs" variant="ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-0">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">Loading…</div>
        ) : failed.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyDescription className="text-muted-foreground text-sm">
                No failed close runs. Nice and green.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div>
            {failed.length >= FAILED_THRESHOLD && (
              <p className="mb-2 text-destructive text-xs">
                {failed.length} failed runs - above the {FAILED_THRESHOLD} alert threshold. Consider retrying or
                reviewing.
              </p>
            )}
            {failed.map((run) => (
              <FailedRunRow
                key={run.runId}
                run={run}
                onRetried={(runId) => setFailed((prev) => prev.filter((r) => r.runId !== runId))}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
