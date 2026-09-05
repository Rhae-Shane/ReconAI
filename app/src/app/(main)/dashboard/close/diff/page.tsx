"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RunDiff {
  a: { id: string };
  b: { id: string };
  matchRateDelta: number;
  matchedDelta: number;
  exceptionDelta: number;
  unresolvedDelta: number;
  recordsDelta: number;
  addedUnresolved: string[];
  clearedUnresolved: string[];
}

function delta(n: number, pct = false) {
  const sign = n > 0 ? "+" : "";
  const body = pct ? `${(n * 100).toFixed(1)}pp` : String(n);
  return `${sign}${body}`;
}

export default function CloseDiffPage() {
  const [diff, setDiff] = useState<RunDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/close/runs/diff")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Diff failed");
        setDiff(body as RunDiff);
        setError(null);
      })
      .catch((err: unknown) => {
        setDiff(null);
        setError(err instanceof Error ? err.message : "Diff failed");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl tracking-tight">Run vs previous</h1>
        <p className="text-muted-foreground text-sm">
          Match-rate and exception regression between the latest two closes.
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {diff && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { label: "Match rate", value: delta(diff.matchRateDelta, true) },
              { label: "Matched", value: delta(diff.matchedDelta) },
              { label: "Exceptions", value: delta(diff.exceptionDelta) },
              { label: "Unresolved", value: delta(diff.unresolvedDelta) },
              { label: "Records", value: delta(diff.recordsDelta) },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-1">
                  <CardTitle className="font-normal text-muted-foreground text-xs">{s.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-xl tabular-nums">{s.value}</CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                {diff.a.id} vs {diff.b.id}
              </CardTitle>
              <CardDescription>Refs that appeared or cleared since the previous run.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Change</TableHead>
                    <TableHead>Ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diff.addedUnresolved.map((r) => (
                    <TableRow key={`a-${r}`}>
                      <TableCell>
                        <Badge variant="destructive">added</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r}</TableCell>
                    </TableRow>
                  ))}
                  {diff.clearedUnresolved.map((r) => (
                    <TableRow key={`c-${r}`}>
                      <TableCell>
                        <Badge variant="secondary">cleared</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r}</TableCell>
                    </TableRow>
                  ))}
                  {diff.addedUnresolved.length === 0 && diff.clearedUnresolved.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} className="text-muted-foreground">
                        No unresolved-ref movement.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
