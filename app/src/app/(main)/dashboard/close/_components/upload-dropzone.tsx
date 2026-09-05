"use client";

import { useRef, useState } from "react";

import { CloudUpload, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ColumnMapping, MAP_TARGETS } from "@/lib/close/csv-map";
import type { CloseReport } from "@/lib/close/types";

interface UploadResult {
  runId: string;
  report: CloseReport;
  sharded?: boolean;
  shards?: number;
}

const PSP = [
  { id: "", label: "Auto (filename)" },
  { id: "razorpay", label: "Razorpay" },
  { id: "stripe", label: "Stripe" },
  { id: "payu", label: "PayU" },
  { id: "gst2b", label: "GSTR-2B" },
  { id: "bank", label: "Bank" },
];

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [source, setSource] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [showMap, setShowMap] = useState(false);

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

    if (!source) {
      await suggest(text);
    }

    setUploading(true);
    try {
      const form = new FormData();
      for (const file of list) form.append(file.name, file);
      if (source) form.append("source", source);
      const res = await fetch("/api/close/upload", { method: "POST", body: form });
      const data = (await res.json()) as UploadResult | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Upload failed");
      if ((data as UploadResult).runId) {
        setResult(data as UploadResult);
        toast.success(
          `Reconciled into ${(data as UploadResult).runId}${(data as UploadResult).sharded ? " (sharded)" : ""}.`,
        );
      } else {
        toast.success("Parsed source file.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process the upload.");
    } finally {
      setUploading(false);
    }
  }

  async function applyMap() {
    if (!csvText) return;
    setUploading(true);
    try {
      const res = await fetch("/api/close/upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: csvText, mapping }),
      });
      const data = (await res.json()) as UploadResult | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Map failed");
      setResult(data as UploadResult);
      toast.success(`Mapped CSV into ${(data as UploadResult).runId}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply mapping.");
    } finally {
      setUploading(false);
    }
  }

  const breakdown = result?.report.breakdown;
  const matchRate = breakdown ? Math.round(breakdown.matchRate * 100 * 10) / 10 : 0;
  const stats = [
    { label: "Matched", value: breakdown?.matched ?? 0, cls: "text-emerald-600" },
    { label: "Partial", value: breakdown?.partial ?? 0, cls: "text-amber-600" },
    { label: "Unresolved", value: breakdown?.unresolved ?? 0, cls: "text-rose-600" },
    { label: "Match rate", value: `${matchRate}%`, cls: "text-foreground" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="size-4 text-muted-foreground" />
          Upload CSV · mapper · multi-PSP
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            {PSP.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
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
              <Loader2 className="animate-spin" /> Reconciling upload...
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
          <div className="space-y-2 rounded-lg border p-3">
            <p className="font-medium text-sm">Column mapper</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {MAP_TARGETS.map((target) => (
                <label key={target} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{target}</span>
                  <select
                    className="h-8 min-w-32 rounded-md border bg-transparent px-2"
                    value={mapping[target] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [target]: e.target.value || undefined }))}
                  >
                    <option value="">—</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <Button
              size="sm"
              disabled={uploading || !mapping.sourceRef || !mapping.amount}
              onClick={() => void applyMap()}
            >
              Reconcile with this map
            </Button>
          </div>
        )}

        {breakdown && result && (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg border border-border bg-background px-3 py-2">
                  <div className="text-muted-foreground text-xs">{s.label}</div>
                  <div className={`font-semibold text-lg leading-tight ${s.cls}`}>{s.value}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span>
                Records: {breakdown.records} · Unresolved: {result.report.unresolved.length}
                {result.sharded ? ` · ${result.shards} shards` : ""}
              </span>
              <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
                Upload more
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
