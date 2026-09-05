"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { CloudUpload, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type ColumnMapping, MAP_TARGETS } from "@/lib/close/csv-map";
import type { CloseReport } from "@/lib/close/types";

import { KpiHint } from "./kpi-hint";

export interface UploadPipelineResult {
  runId: string;
  report: CloseReport;
  sharded?: boolean;
  shards?: number;
  nodeOrder?: string[];
  aiJudgments?: number;
  status?: string;
}

interface UploadDropzoneProps {
  onPipelineStart?: () => void;
  onPipelineDone?: (result: UploadPipelineResult) => void;
  onPipelineError?: (message: string) => void;
}

const PSP = [
  { id: "auto", label: "Auto (filename)" },
  { id: "razorpay", label: "Razorpay" },
  { id: "stripe", label: "Stripe" },
  { id: "payu", label: "PayU" },
  { id: "gst2b", label: "GSTR-2B" },
  { id: "bank", label: "Bank" },
];

const UNMAPPED = "__none__";

export function UploadDropzone({ onPipelineStart, onPipelineDone, onPipelineError }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadPipelineResult | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [source, setSource] = useState("auto");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [showMap, setShowMap] = useState(false);

  const adapterSource = source === "auto" ? "" : source;

  async function suggest(text: string) {
    const res = await fetch("/api/close/upload/map", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const body = (await res.json()) as { headers: string[]; mapping: ColumnMapping };
    setHeaders(body.headers);
    setMapping(body.mapping);
    setShowMap(true);
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setFileNames(list.map((f) => f.name));
    setResult(null);
    const text = await list[0].text();
    setCsvText(text);

    if (!adapterSource) {
      await suggest(text);
    }

    onPipelineStart?.();
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of list) form.append(file.name, file);
      if (adapterSource) form.append("source", adapterSource);
      const res = await fetch("/api/close/upload", { method: "POST", body: form });
      const data = (await res.json()) as UploadPipelineResult | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Upload failed");
      if ((data as UploadPipelineResult).runId) {
        const ok = data as UploadPipelineResult;
        setResult(ok);
        onPipelineDone?.(ok);
        toast.success(
          `Full pipeline finished for ${ok.runId}${(ok.aiJudgments ?? 0) > 0 ? ` · ${ok.aiJudgments} AI judgments` : ""}.`,
        );
      } else {
        onPipelineError?.("Map columns, then run the full pipeline.");
        toast.success("Parsed source file — map columns to run the pipeline.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not process the upload.";
      onPipelineError?.(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  async function applyMap() {
    if (!csvText) return;
    onPipelineStart?.();
    setUploading(true);
    try {
      const res = await fetch("/api/close/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: csvText, mapping }),
      });
      const data = (await res.json()) as UploadPipelineResult | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Map failed");
      const ok = data as UploadPipelineResult;
      setResult(ok);
      onPipelineDone?.(ok);
      toast.success(`Full pipeline finished for ${ok.runId}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not apply mapping.";
      onPipelineError?.(message);
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  const breakdown = result?.report.breakdown;
  const matchRate = breakdown ? Math.round(breakdown.matchRate * 100 * 10) / 10 : 0;
  const stats = [
    {
      label: "Matched",
      hint: "Records linked cleanly across sources — no residual doubt left for review.",
      value: breakdown?.matched ?? 0,
      cls: "text-emerald-600",
    },
    {
      label: "Partial",
      hint: "Near-matches held open until amount, date, or UTR gaps are resolved.",
      value: breakdown?.partial ?? 0,
      cls: "text-amber-600",
    },
    {
      label: "Unresolved",
      hint: "Could not be matched — filed as exceptions for an accountant to review.",
      value: breakdown?.unresolved ?? 0,
      cls: "text-rose-600",
    },
    {
      label: "Match rate",
      hint: "Percentage of records that resolved (matched) after this upload.",
      value: `${matchRate}%`,
      cls: "text-foreground",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="size-4 text-muted-foreground" />
          Upload CSV
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger size="sm" className="min-w-40" aria-label="PSP source">
              <SelectValue placeholder="Auto (filename)" />
            </SelectTrigger>
            <SelectContent position="popper">
              {PSP.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" asChild>
            <a href="/api/close/upload/template">Download template</a>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border border-dashed bg-muted/20 px-6 py-10 text-muted-foreground text-sm transition-colors hover:bg-muted/40"
        >
          <Upload className="size-6" />
          {uploading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="animate-spin" /> Running full pipeline...
            </span>
          ) : (
            <span>Click to select CSV / GSTR-2B / bank files</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv,.json,application/json,.sta,.xml"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </button>

        {fileNames.length > 0 && <p className="text-muted-foreground text-xs">{fileNames.join(", ")}</p>}

        {showMap && headers.length > 0 && (
          <div className="space-y-2 overflow-visible rounded-lg border border-border bg-muted/20 p-3">
            <p className="font-medium text-sm">Column mapper</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MAP_TARGETS.map((target) => (
                <div key={target} className="flex items-center justify-between gap-2 text-xs">
                  <span className="shrink-0 text-muted-foreground">{target}</span>
                  <Select
                    value={mapping[target] ?? UNMAPPED}
                    onValueChange={(value) =>
                      setMapping((m) => ({
                        ...m,
                        [target]: value === UNMAPPED ? undefined : value,
                      }))
                    }
                  >
                    <SelectTrigger size="sm" className="min-w-36" aria-label={`Map ${target}`}>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={UNMAPPED}>—</SelectItem>
                      {headers.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              disabled={uploading || !mapping.sourceRef || !mapping.amount}
              onClick={() => void applyMap()}
            >
              Run full pipeline
            </Button>
          </div>
        )}

        {breakdown && result && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-muted-foreground text-xs">
                    <KpiHint hint={s.hint}>{s.label}</KpiHint>
                  </div>
                  <div className={`font-semibold text-lg leading-tight ${s.cls}`}>{s.value}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
              <span>
                Records: {breakdown.records} · Unresolved: {result.report.unresolved.length}
                {result.sharded ? ` · ${result.shards} shards` : ""}
                {(result.aiJudgments ?? 0) > 0 ? ` · AI: ${result.aiJudgments}` : ""}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/dashboard/close/${result.runId}`}>Open run</Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
                  Upload more
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
