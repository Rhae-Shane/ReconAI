"use client";

import { useState } from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

export function Gst2bPanel() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function pull() {
    setBusy(true);
    try {
      const res = await fetch("/api/finance/gst/2b", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as { error?: string; accepted?: number };
      if (!res.ok) throw new Error(data.error ?? "2B ingest failed");
      toast.success(`Stored ${data.accepted ?? 0} GSTR-2B invoice(s). Refresh the page.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not store 2B");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Pull / upload GSTR-2B</CardTitle>
        <CardDescription>
          Paste a GST portal 2B JSON or CSV export. GSTINs on the file are used as-is. Without a file, ReconAI pulls
          Razorpay fee tax invoices against Razorpay&apos;s published GSTIN.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='[{"gstin":"29AAGCR4375J1ZU","invoiceNo":"RZP-FEE-pay_xxx","invoiceDate":"2026-09-01","totalValue":23.60}]'
          className="min-h-28 font-mono text-xs"
        />
        <div className="flex justify-end">
          <Button size="sm" disabled={busy || !text.trim()} onClick={() => void pull()}>
            {busy ? "Saving…" : "Store 2B export"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
