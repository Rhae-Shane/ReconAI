"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { PipelineLive, PIPELINE_STAGES, type PipelinePhase } from "./pipeline-live";
import { RazorpaySyncCard } from "./razorpay-sync-card";
import { UploadDropzone, type UploadPipelineResult } from "./upload-dropzone";

export function CloseWorkspace() {
  const router = useRouter();
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [activeIndex, setActiveIndex] = useState(0);
  const [completedNodes, setCompletedNodes] = useState<string[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [aiJudgments, setAiJudgments] = useState(0);
  const [matchRate, setMatchRate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTick(), [clearTick]);

  function handlePipelineStart() {
    clearTick();
    setPhase("running");
    setActiveIndex(0);
    setCompletedNodes([]);
    setRunId(null);
    setAiJudgments(0);
    setMatchRate(null);
    setError(null);
    tickRef.current = setInterval(() => {
      setActiveIndex((i) => Math.min(i + 1, PIPELINE_STAGES.length - 1));
    }, 700);
  }

  function handlePipelineDone(result: UploadPipelineResult) {
    clearTick();
    setPhase("done");
    setActiveIndex(PIPELINE_STAGES.length - 1);
    setCompletedNodes(result.nodeOrder?.length ? result.nodeOrder : PIPELINE_STAGES.map((s) => s.id));
    setRunId(result.runId);
    setAiJudgments(result.aiJudgments ?? 0);
    setMatchRate(result.report.breakdown?.matchRate ?? null);
    setError(null);
    router.refresh();
  }

  function handlePipelineError(message: string) {
    clearTick();
    // Soft idle when waiting on column mapper — don't flash a failure state.
    if (message.toLowerCase().includes("map columns")) {
      setPhase("idle");
      setError(null);
      return;
    }
    setPhase("error");
    setError(message);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="space-y-3">
        <h2 className="font-medium text-sm">New reconciliation</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UploadDropzone
            onPipelineStart={handlePipelineStart}
            onPipelineDone={handlePipelineDone}
            onPipelineError={handlePipelineError}
          />
          <RazorpaySyncCard />
        </div>
      </section>

      <PipelineLive
        phase={phase}
        activeIndex={activeIndex}
        completedNodes={completedNodes}
        runId={runId}
        aiJudgments={aiJudgments}
        matchRate={matchRate}
        error={error}
      />
    </div>
  );
}
