"use client";

import { useRef, useState } from "react";

import { CloudUpload, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CloseReport } from "@/lib/close/types";

interface UploadResult {
  runId: string;
  report: CloseReport;
}

export function UploadDropzone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setFileNames(Array.from(files).map((f) => f.name));
    setResult(null);
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) form.append(file.name, file);
      const res = await fetch("/api/close/upload", { method: "POST", body: form });
      const data = (await res.json()) as UploadResult | { error?: string };
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Upload failed");
      setResult(data as UploadResult);
      toast.success(`Uploaded ${Array.from(files).length} file(s) - reconciled into ${(data as UploadResult).runId}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process the upload.");
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
          Upload payments.csv / settlements.csv / invoices.csv
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
            <span>Click to select one or more CSV files</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </button>

        {fileNames.length > 0 && <p className="text-muted-foreground text-xs">{fileNames.join(", ")}</p>}

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
                Records: {breakdown.records} · Unresolved lines: {result.report.unresolved.length}
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
