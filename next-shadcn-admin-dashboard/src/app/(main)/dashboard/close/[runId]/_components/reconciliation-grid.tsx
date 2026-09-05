"use client";

import { useMemo, useState } from "react";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatPaise } from "@/lib/close/config";
import { buildMatchExplanation, type MatchExplanation } from "@/lib/close/explain";
import type { ExceptionRecord, Flap, MatchGroup, ReasonCode, RunDetail } from "@/lib/close/types";

import { MatchExplanationDrawer } from "./match-explanation-drawer";

function MethodBadge({ method }: { method: MatchGroup["method"] }) {
  if (method === "EXACT") {
    return (
      <Badge
        className="border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
        variant="outline"
      >
        EXACT
      </Badge>
    );
  }
  if (method === "NORMALIZED") {
    return (
      <Badge className="border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300" variant="outline">
        NORMALIZED
      </Badge>
    );
  }
  if (method === "NETTED") {
    return (
      <Badge className="border-teal-700/25 text-teal-700 dark:border-teal-300/25 dark:text-teal-300" variant="outline">
        NETTED
      </Badge>
    );
  }
  return <Badge variant="secondary">JUDGED</Badge>;
}

function ConfidenceBadge({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  let tone = "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300";
  if (value >= 0.95) {
    tone = "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300";
  } else if (value >= 0.8) {
    tone = "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300";
  }
  return (
    <Badge variant="outline" className={tone}>
      {pct}%
    </Badge>
  );
}

function ReasonCodeBadge({ code }: { code: ReasonCode }) {
  const tone =
    code === "LOW_CONFIDENCE"
      ? "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300"
      : "border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300";
  return (
    <Badge variant="outline" className={tone}>
      {code}
    </Badge>
  );
}

function MatchedColumns(): ColumnDef<MatchGroup>[] {
  return [
    {
      accessorKey: "key",
      header: "Group key",
      cell: ({ row }) => <span className="font-medium">{row.original.key}</span>,
    },
    { accessorKey: "method", header: "Method", cell: ({ row }) => <MethodBadge method={row.original.method} /> },
    {
      id: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <Badge variant="secondary" className="font-normal">
          {row.original.reason}
        </Badge>
      ),
    },
    {
      accessorKey: "confidence",
      header: () => <div className="w-20">Confidence</div>,
      cell: ({ row }) => <ConfidenceBadge value={row.original.confidence} />,
    },
    {
      accessorKey: "amountPaise",
      header: () => <div className="w-28 text-right">Amount</div>,
      cell: ({ row }) => <div className="w-28 text-right tabular-nums">{formatPaise(row.original.amountPaise)}</div>,
    },
    {
      id: "sources",
      header: () => <div className="text-right">Linked</div>,
      cell: ({ row }) => (
        <div className="text-right text-muted-foreground tabular-nums">{row.original.links.length} records</div>
      ),
    },
  ];
}

function FlapColumns(): ColumnDef<Flap>[] {
  return [
    { accessorKey: "id", header: "Flap", cell: ({ row }) => <span className="font-medium">{row.original.id}</span> },
    { accessorKey: "reason", header: "Reason" },
    {
      accessorKey: "amountPaise",
      header: () => <div className="w-28 text-right">Amount</div>,
      cell: ({ row }) => <div className="w-28 text-right tabular-nums">{formatPaise(row.original.amountPaise)}</div>,
    },
    {
      id: "candidates",
      header: () => <div className="text-right">Candidates</div>,
      cell: ({ row }) => (
        <div className="text-right text-muted-foreground tabular-nums">{row.original.recordIds.length}</div>
      ),
    },
  ];
}

function ExceptionColumns(): ColumnDef<ExceptionRecord>[] {
  return [
    {
      accessorKey: "id",
      header: "Exception",
      cell: ({ row }) => <span className="font-medium">{row.original.id}</span>,
    },
    {
      accessorKey: "reasonCode",
      header: "Reason code",
      cell: ({ row }) => <ReasonCodeBadge code={row.original.reasonCode} />,
    },
    {
      accessorKey: "rationale",
      header: "Rationale",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.rationale}</span>,
    },
    {
      accessorKey: "status",
      header: () => <div className="w-28">Status</div>,
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    },
  ];
}

function GridTable<T>({
  rows,
  columns,
  onRowClick,
  clickable,
}: {
  rows: T[];
  columns: ColumnDef<T>[];
  onRowClick?: (row: T) => void;
  clickable?: boolean;
}) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <Table className="w-full border-collapse">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className="hover:bg-transparent [&>:not(:last-child)]:border-r">
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id} className="h-10 px-4 font-medium text-muted-foreground text-sm">
                {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={`h-12 hover:bg-muted/20 [&>:not(:last-child)]:border-r ${clickable ? "cursor-pointer" : ""}`}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="px-4 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
              No records in this tab.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export function ReconciliationGrid({ run }: { run: RunDetail }) {
  const [tab, setTab] = useState("matched");
  const [explanation, setExplanation] = useState<MatchExplanation | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const matchedColumns = useMemo(() => MatchedColumns(), []);
  const flapColumns = useMemo(() => FlapColumns(), []);
  const exceptionColumns = useMemo(() => ExceptionColumns(), []);
  const records = run.records ?? [];

  function openMatch(group: MatchGroup) {
    setExplanation(buildMatchExplanation(group, records));
    setDrawerOpen(true);
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Tabs value={tab} onValueChange={setTab} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 pt-3 pb-2">
          <TabsList variant="line">
            <TabsTrigger value="matched">Matched ({run.groups.length})</TabsTrigger>
            <TabsTrigger value="flaps">Flaps ({run.flaps.length})</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions ({run.exceptions.length})</TabsTrigger>
          </TabsList>
          {tab === "matched" && (
            <span className="text-muted-foreground text-xs">Click a row to see why it matched</span>
          )}
        </div>

        <div className="px-2 pb-2">
          <TabsContent value="matched">
            <GridTable rows={run.groups} columns={matchedColumns} clickable onRowClick={openMatch} />
          </TabsContent>
          <TabsContent value="flaps">
            <GridTable rows={run.flaps} columns={flapColumns} />
          </TabsContent>
          <TabsContent value="exceptions">
            <GridTable rows={run.exceptions} columns={exceptionColumns} />
          </TabsContent>
        </div>
      </Tabs>

      <MatchExplanationDrawer explanation={explanation} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
