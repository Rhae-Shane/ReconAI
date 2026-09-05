"use client";

import { useEffect, useMemo, useState } from "react";

import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExceptionRecord, ReasonCode } from "@/lib/close/types";

import { ExceptionDetailDrawer } from "./exception-detail-drawer";

const REASON_TONES: Record<ReasonCode, string> = {
  NO_KEY: "border-slate-600/40 text-slate-700 dark:border-slate-300/40 dark:text-slate-300",
  AMOUNT_MISMATCH: "border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300",
  PARTIAL_FLAP: "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300",
  DATE_SKEW: "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300",
  LOW_CONFIDENCE: "border-orange-700/25 text-orange-700 dark:border-orange-300/25 dark:text-orange-300",
  DUPLICATE: "border-purple-700/25 text-purple-700 dark:border-purple-300/25 dark:text-purple-300",
  UNKNOWN_SOURCE: "border-slate-600/40 text-slate-700 dark:border-slate-300/40 dark:text-slate-300",
};

export function ExceptionsTable({
  initial,
  onChange,
}: {
  initial: ExceptionRecord[];
  onChange?: (rows: ExceptionRecord[]) => void;
}) {
  const [data, setData] = useState<ExceptionRecord[]>(initial);
  const [selected, setSelected] = useState<ExceptionRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setData(initial);
  }, [initial]);

  const columns = useMemo<ColumnDef<ExceptionRecord>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Exception",
        cell: ({ row }) => <span className="font-medium">{row.original.id}</span>,
      },
      {
        accessorKey: "reasonCode",
        header: "Reason code",
        cell: ({ row }) => (
          <Badge variant="outline" className={REASON_TONES[row.original.reasonCode]}>
            {row.original.reasonCode}
          </Badge>
        ),
      },
      {
        accessorKey: "rationale",
        header: "Rationale",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.rationale}</span>,
      },
      {
        accessorKey: "status",
        header: () => <div className="w-28">Status</div>,
        cell: ({ row }) => {
          const s = row.original.status;
          const rs = row.original.resolutionStatus;
          const label = rs === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : s;
          const tone =
            label === "OPEN"
              ? "border-red-700/25 text-red-700 dark:border-red-300/25 dark:text-red-300"
              : label === "PENDING_APPROVAL"
                ? "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300"
                : label === "RESOLVED"
                  ? "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
                  : "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300";
          return (
            <div className="w-36">
              <Badge variant="outline" className={tone}>
                <span className="size-1.5 rounded-full bg-current" />
                {label}
              </Badge>
            </div>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: () => <div className="w-36">Filed</div>,
        cell: ({ row }) => (
          <div className="w-36 text-muted-foreground">{format(parseISO(row.original.createdAt), "d MMM, HH:mm")}</div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  function open(row: ExceptionRecord) {
    setSelected(row);
    setDrawerOpen(true);
  }

  function handleResolved(updated: ExceptionRecord) {
    setSelected(updated);
    setData((prev) => {
      const next = prev.map((e) => (e.id === updated.id ? updated : e));
      onChange?.(next);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Filter by rationales…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-muted-foreground text-sm tabular-nums">
          {table.getFilteredRowModel().rows.length} rows
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
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
                  className="h-12 cursor-pointer hover:bg-muted/20 [&>:not(:last-child)]:border-r"
                  onClick={() => open(row.original)}
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
                  No exceptions match the filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ExceptionDetailDrawer
        exception={selected}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onResolved={handleResolved}
      />
    </div>
  );
}
