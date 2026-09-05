"use client";

import { useMemo, useState } from "react";

import { type ColumnDef, flexRender, getCoreRowModel, getFilteredRowModel, useReactTable } from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { TaxLineMatch } from "@/lib/close/types";

function ConfidenceBadge({ value }: { value: number }) {
  const pct = (value * 100).toFixed(0);
  const tone =
    value >= 0.95
      ? "border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
      : value >= 0.8
        ? "border-blue-700/25 text-blue-700 dark:border-blue-300/25 dark:text-blue-300"
        : "border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300";
  return (
    <Badge variant="outline" className={tone}>
      {pct}%
    </Badge>
  );
}

export function TaxMatchTable({ matches }: { matches: TaxLineMatch[] }) {
  const [filter, setFilter] = useState("");

  const columns = useMemo<ColumnDef<TaxLineMatch>[]>(
    () => [
      {
        accessorKey: "recordId",
        header: "Record",
        cell: ({ row }) => <span className="font-medium">{row.original.recordId}</span>,
      },
      {
        id: "category",
        header: "Category",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span>{row.original.categoryLabel ?? "Unmatched"}</span>
            {row.original.categoryCode && (
              <span className="text-muted-foreground text-xs">HSN {row.original.categoryCode}</span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "matchedBy",
        header: "Matched by",
        cell: ({ row }) => (
          <Badge variant={row.original.matchedBy === "RULE" ? "secondary" : "outline"}>
            {row.original.matchedBy === "RULE" ? "RULE" : "JUDGED (OpenAI)"}
          </Badge>
        ),
      },
      {
        accessorKey: "confidence",
        header: () => <div className="w-24">Confidence</div>,
        cell: ({ row }) => <ConfidenceBadge value={row.original.confidence} />,
      },
      {
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.reason}</span>,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: matches,
    columns,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Filter categories or reasons…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <span className="text-muted-foreground text-sm tabular-nums">
          {table.getFilteredRowModel().rows.length} lines
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
                <TableRow key={row.id} className="h-12 hover:bg-muted/20 [&>:not(:last-child)]:border-r">
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
                  No tax lines match the filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
