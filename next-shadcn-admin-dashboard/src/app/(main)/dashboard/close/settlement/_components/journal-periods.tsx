"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface FiscalPeriod {
  id: string;
  label: string;
  status: "open" | "closed";
}

interface TrialBalance {
  rows: Array<{ account: string; netPaise: number }>;
  totalPaise: number;
  balanced: boolean;
}

function fmtPaise(paise: number) {
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${(Math.abs(paise) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** Journal & fiscal-period panel for the settlement page (client fetch - data lives behind auth'd api routes). */
export function JournalPeriods() {
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [tb, setTb] = useState<TrialBalance | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([
      fetch("/api/finance/periods").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/finance/ledger").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([p, l]) => {
        setPeriods(p?.periods ?? []);
        setTb(l);
      })
      .catch(() => {
        setPeriods([]);
        setTb(null);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = useCallback(
    async (action: "closePeriod" | "reopenPeriod", id: string) => {
      setBusy(true);
      try {
        await fetch("/api/finance/periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, id, by: "dashboard" }),
        });
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [refresh],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Fiscal periods</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {periods.length === 0 && <p className="text-muted-foreground text-sm">No fiscal periods configured yet.</p>}
          {periods.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                <Badge variant={p.status === "open" ? "secondary" : "outline"}>{p.status}</Badge>
              </div>
              {p.status === "open" ? (
                <Button size="xs" variant="outline" disabled={busy} onClick={() => act("closePeriod", p.id)}>
                  Close
                </Button>
              ) : (
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => act("reopenPeriod", p.id)}>
                  Reopen
                </Button>
              )}
            </div>
          ))}
          <p className="text-muted-foreground mt-1 text-xs">
            Closing a period locks it - postings into closed periods are rejected.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Trial balance</CardTitle>
        </CardHeader>
        <CardContent>
          {!tb ? (
            <p className="text-muted-foreground text-sm">Loading ledger…</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tb.rows.length === 0 && (
                    <TableRow>
                      <TableCell className="text-muted-foreground" colSpan={2}>
                        No postings yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {tb.rows.map((r) => (
                    <TableRow key={r.account}>
                      <TableCell className="font-medium">{r.account}</TableCell>
                      <TableCell className="text-right">{fmtPaise(r.netPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  Total: <span className="font-medium">{fmtPaise(tb.totalPaise)}</span>
                </span>
                {tb.balanced ? (
                  <Badge variant="secondary">balanced</Badge>
                ) : (
                  <Badge variant="destructive">out of balance</Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-2 text-xs">
                Posting to the journal and closing periods requires an owner or accountant role.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
