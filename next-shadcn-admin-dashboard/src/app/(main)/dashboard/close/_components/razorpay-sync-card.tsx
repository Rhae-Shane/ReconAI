"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncStatus {
  configured?: boolean;
  inbox?: number;
  mode?: "live" | "test" | "unknown";
}

interface SyncResult {
  runId?: string;
  mode?: string;
  counts?: { payments: number; settlements: number; refunds: number; records: number };
  error?: string;
  hint?: string;
}

export function RazorpaySyncCard() {
  const router = useRouter();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    void fetch("/api/close/razorpay/sync")
      .then((res) => res.json() as Promise<SyncStatus>)
      .then(setStatus)
      .catch(() => setStatus({ configured: false, inbox: 0 }));
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/close/razorpay/sync", { method: "POST" });
      const data = (await res.json()) as SyncResult;
      if (!res.ok) {
        toast.error(data.error === "empty" ? "Razorpay account has no payments yet" : "Sync failed", {
          description: data.hint,
        });
        return;
      }
      toast.success(`Synced ${data.counts?.records ?? 0} Razorpay records into ${data.runId}.`);
      if (data.runId) router.push(`/dashboard/close/${data.runId}`);
      else router.refresh();
    } catch {
      toast.error("Could not reach Razorpay sync.");
    } finally {
      setSyncing(false);
    }
  }

  async function handlePaymentLink() {
    setLinking(true);
    try {
      const res = await fetch("/api/close/razorpay/payment-link", { method: "POST" });
      const data = (await res.json()) as { short_url?: string; error?: string; hint?: string };
      if (!res.ok || !data.short_url) {
        toast.error("Could not create a payment link", { description: data.hint ?? data.error });
        return;
      }
      toast.success("Payment link created — complete it with the Razorpay test card, then Sync.");
      window.open(data.short_url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not create a payment link.");
    } finally {
      setLinking(false);
    }
  }

  const connected = Boolean(status?.configured);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 font-normal text-muted-foreground text-sm">
          <WalletCards className="size-4" />
          Live Razorpay pull
        </CardTitle>
        <Badge variant="outline">
          {connected ? `${status?.mode === "live" ? "live" : "test"} keys connected` : "keys missing"}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">
          Pull captured payments, settlements and refunds from the connected Razorpay{" "}
          {status?.mode === "live" ? "live" : "test"} account.
          {status?.mode === "live"
            ? " Captures without a bank UTR stay on the exception list until Razorpay settles."
            : " Test accounts never settle — a synthetic bank UTR is attached per capture so the matcher can close."}
          {typeof status?.inbox === "number" ? ` · webhook inbox ${status.inbox}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void handleSync()} disabled={syncing || !connected}>
            {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw data-icon="inline-start" />}
            Sync from Razorpay
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handlePaymentLink()} disabled={linking || !connected}>
            {linking ? <Loader2 className="animate-spin" /> : null}
            Create test payment
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
