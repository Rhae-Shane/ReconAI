"use client";

import { useMemo } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { format, parseISO } from "date-fns";
import { ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CloseRunMeta } from "@/lib/close/types";

function StatusBadge({ status }: { status: CloseRunMeta["status"] }) {
  if (status === "RUNNING") {
    return (
      <Badge
        className="border-yellow-700/25 text-yellow-700 dark:border-yellow-300/25 dark:text-yellow-300"
        variant="outline"
      >
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
        Running
      </Badge>
    );
  }
  if (status === "DONE") {
    return (
      <Badge
        className="border-green-700/25 text-green-700 dark:border-green-300/25 dark:text-green-300"
        variant="outline"
      >
        <span className="size-1.5 rounded-full bg-current" />
        Done
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <span className="size-1.5 rounded-full bg-current" />
      Failed
    </Badge>
  );
}

function ResolvedCell({ run }: { run: CloseRunMeta }) {
  if (run.status !== "DONE") {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-chart-3" style={{ width: `${run.totals.resolvedPct}%` }} />
      </div>
      <span className="tabular-nums">{run.totals.resolvedPct.toFixed(1)}%</span>
    </div>
  );
}

export function RunsTable({ runs }: { runs: CloseRunMeta[] }) {
  const router = useRouter();

  const columns = useMemo<ColumnDef<CloseRunMeta>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Run",
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium leading-none">{row.original.id}</span>
            <span className="text-muted-foreground text-xs">{row.original.batchRef}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "startedAt",
        header: () => <div className="w-44">Started</div>,
        cell: ({ row }) => (
          <div className="w-44 text-muted-foreground">
            {format(parseISO(row.original.startedAt), "d MMM yyyy, HH:mm")}
          </div>
        ),
      },
      {
        accessorKey: "records",
        header: () => <div className="w-20 text-right">Records</div>,
        cell: ({ row }) => <div className="w-20 text-right tabular-nums">{row.original.totals.records}</div>,
      },
      {
        id: "resolved",
        header: () => <div className="w-32">Resolved</div>,
        cell: ({ row }) => <ResolvedCell run={row.original} />,
      },
      {
        id: "exceptions",
        header: () => <div className="text-right">Exceptions</div>,
        cell: ({ row }) => (
          <div className="text-right">
            {row.original.status === "DONE" ? (
              <Badge variant={row.original.totals.exceptions > 0 ? "destructive" : "outline"}>
                {row.original.totals.exceptions}
              </Badge>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="flex w-full justify-end" />,
        cell: ({ row }) => (
          <div className="flex w-full justify-end" onClick={(e) => e.stopPropagation()}>
            <Button asChild size="icon-sm" variant="ghost" aria-label={`Open run ${row.original.id}`}>
              <Link href={`/dashboard/close/${row.original.id}`}>
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: runs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
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
                className="h-14 cursor-pointer hover:bg-muted/20 [&>:not(:last-child)]:border-r"
                onClick={() => router.push(`/dashboard/close/${row.original.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/dashboard/close/${row.original.id}`);
                  }
                }}
                tabIndex={0}
                role="link"
                aria-label={`Open run ${row.original.id}`}
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
                No close runs yet. Start one to see it here.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
