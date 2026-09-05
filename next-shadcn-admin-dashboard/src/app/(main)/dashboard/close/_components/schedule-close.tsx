"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "Schedule close" control - picks a future datetime and enqueues a delayed BullMQ close-run job via
 * POST /api/close/runs/schedule. The runId is generated client-side (same demo convention as the
 * run store) so the schedule and the run name line up; server-side the job fires the `close-run`
 * worker when its delay elapses.
 */
function newRunId(): string {
  return `close-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function ScheduleClose() {
  const router = useRouter();
  const [runId] = useState(() => newRunId());
  const [runAt, setRunAt] = useState("");
  const [scheduling, setScheduling] = useState(false);

  async function handleSchedule() {
    if (!runAt) {
      toast.error("Pick a date and time to schedule the close.");
      return;
    }
    const iso = new Date(runAt).toISOString();
    setScheduling(true);
    try {
      const res = await fetch("/api/close/runs/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, runAt: iso }),
      });
      if (res.status === 503) {
        toast.error("Scheduling unavailable - the close queue is not configured (no Redis).");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Schedule failed");
      }
      toast.success(`Close run ${runId} scheduled for ${new Date(runAt).toLocaleString()}.`);
      setRunAt("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule the close run.");
    } finally {
      setScheduling(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-normal text-muted-foreground text-sm">
          <CalendarClock className="size-4" />
          Schedule close
        </CardTitle>
        <CardDescription className="text-xs">
          Run: <span className="font-medium text-foreground">{runId}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex w-full flex-col gap-1.5">
          <Label htmlFor="close-schedule-at" className="text-xs">
            When
          </Label>
          <Input
            id="close-schedule-at"
            type="datetime-local"
            value={runAt}
            onChange={(e) => setRunAt(e.target.value)}
            className="w-full"
          />
        </div>
        <Button onClick={handleSchedule} disabled={scheduling}>
          {scheduling ? <Loader2 className="animate-spin" /> : <CalendarClock />}
          {scheduling ? "Scheduling…" : "Schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}
