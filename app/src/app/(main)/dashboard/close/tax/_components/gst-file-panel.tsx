"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Filing {
  id: string;
  kind: string;
  period: string;
  status: string;
  hash: string;
  submittedAt?: string;
}

interface FilePayload {
  org?: { gstin: string; name: string };
  period?: string;
  drafts?: Record<string, { hash: string; payload: unknown }>;
  filings?: Filing[];
}

export function GstFilePanel() {
  const [data, setData] = useState<FilePayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/finance/gst/file")
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(kind: "GSTR1" | "GSTR3B") {
    setBusy(kind);
    try {
      const res = await fetch("/api/finance/gst/file", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const body = (await res.json()) as { error?: string; filing?: Filing };
      if (!res.ok) throw new Error(body.error ?? "Submit failed");
      toast.success(`${kind} submitted to GST sandbox (hash ${body.filing?.hash.slice(0, 10)}…)`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">GST return submit</CardTitle>
        <CardDescription>
          Builds GSTR-1 and GSTR-3B for {data?.org?.name ?? "Rhae"} ({data?.org?.gstin ?? "—"}) period{" "}
          {data?.period ?? "—"}. Submit writes a signed sandbox filing — it does not call the live GSTN portal.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy !== null} onClick={() => void submit("GSTR1")}>
            {busy === "GSTR1" ? "Filing…" : "Submit GSTR-1"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void submit("GSTR3B")}>
            {busy === "GSTR3B" ? "Filing…" : "Submit GSTR-3B"}
          </Button>
        </div>
        {(data?.filings ?? []).length > 0 && (
          <ul className="space-y-1 text-xs">
            {data!.filings!.slice(0, 8).map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{f.kind}</Badge>
                <span>{f.period}</span>
                <Badge variant="outline">{f.status}</Badge>
                <span className="font-mono text-muted-foreground">{f.hash.slice(0, 12)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
