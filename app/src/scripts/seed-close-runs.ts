/**
 * Seed realistic daily close runs (27 Aug → today) into Postgres + Redis,
 * and remove empty / zero-record junk runs (run_failed, run_demo_*, etc.).
 *
 * Usage (from app/):
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs src/scripts/seed-close-runs.ts
 */
import { addDays, format } from "date-fns";

import { defaultCloseOrgId } from "@/lib/close/org";
import { deleteCloseRunFromPrisma, listCloseRunsFromPrisma, persistCloseRunToPrisma } from "@/lib/close/prisma-store";
import { deleteRun, saveRun } from "@/lib/close/run-store";
import {
  buildDataset,
  getReport,
  putRunState,
  repairDataset,
  type BuildDatasetOptions,
} from "@/lib/close/store";
import { getPool } from "@/lib/db";
import type { GstB2bRow } from "@/lib/finance/gst";
import { gstr2bFromRecords, internalPurchaseRows } from "@/lib/finance/gst-books";
import { saveGstr2b } from "@/lib/finance/gst-store";

const START = new Date(Date.UTC(2026, 7, 27, 9, 15, 0)); // 27 Aug 2026
const END = new Date(Date.UTC(2026, 8, 5, 14, 29, 0)); // 5 Sep 2026 (today)

function daySeed(ymd: string): number {
  let h = 2166136261;
  for (let i = 0; i < ymd.length; i += 1) {
    h ^= ymd.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function optionsForDay(dayIndex: number, ymd: string): BuildDatasetOptions {
  // Weekdays busier; weekend quieter — still enough rows for a rich UI.
  const weekend = [0, 6].includes(new Date(`${ymd}T12:00:00Z`).getUTCDay());
  const base = weekend ? 48 : 68 + (dayIndex % 5) * 8;
  return {
    seed: daySeed(ymd),
    matchedMovements: base + (dayIndex % 3) * 4,
    orphans: weekend ? 5 : 7 + (dayIndex % 4),
    amountMismatches: weekend ? 3 : 4 + (dayIndex % 3),
    duplicates: 2 + (dayIndex % 2),
    nearMisses: weekend ? 3 : 4 + (dayIndex % 2),
    gstOrphans: 2 + (dayIndex % 2),
  };
}

function isEmptyRun(meta: { id: string; totals: { records: number; resolvedPct: number } }): boolean {
  if (meta.totals.records <= 0) return true;
  if (meta.totals.resolvedPct === 0 && meta.id.startsWith("run_upload_")) return true;
  if (meta.id === "run_failed" || meta.id.startsWith("run_failed")) return true;
  if (meta.id === "run_demo_20260823" || meta.id.startsWith("run_demo_")) return true;
  return false;
}

async function removeRunEverywhere(runId: string): Promise<void> {
  await deleteCloseRunFromPrisma(runId).catch(() => false);
  await deleteRun(runId).catch(() => false);
  console.log(`  deleted ${runId}`);
}

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error("DATABASE_URL / DIRECT_URL not configured — aborting.");
    process.exit(1);
  }

  console.log(`Org: ${defaultCloseOrgId()}`);
  console.log("Cleaning empty / junk runs…");

  const existing = await listCloseRunsFromPrisma();
  const toDelete = new Set<string>();
  for (const meta of existing) {
    if (isEmptyRun(meta)) toDelete.add(meta.id);
    // Always replace prior day seeds + cockpit alias so GST/fee books stay fresh.
    if (meta.id === "run_today" || /^run_\d{8}$/.test(meta.id)) toDelete.add(meta.id);
  }
  // Always purge known junk ids even if not listed (Redis-only ghosts).
  for (const id of ["run_failed", "run_demo_20260823", "batch-run_failed", "batch-run_demo_20260823", "run_today"]) {
    toDelete.add(id);
  }

  for (const id of toDelete) {
    await removeRunEverywhere(id);
  }

  console.log(`Seeding close runs ${format(START, "d MMM yyyy")} → ${format(END, "d MMM yyyy")}…`);

  const days: Date[] = [];
  for (let d = new Date(START); d.getTime() <= END.getTime(); d = addDays(d, 1)) {
    days.push(new Date(d));
  }

  let latestRunId = "";
  for (let i = 0; i < days.length; i += 1) {
    const day = days[i];
    const ymd = format(day, "yyyyMMdd");
    const runId = `run_${ymd}`;
    const startedAt = day.getTime() + i * 37_000; // slight stagger
    const finishedAt = startedAt + 6_420 + i * 800;
    const opts = optionsForDay(i, ymd);
    const dataset = repairDataset(buildDataset(runId, startedAt, opts), runId);
    const meta = putRunState(runId, dataset, startedAt, finishedAt);
    const report = getReport(runId);
    if (report) {
      report.generatedAt = new Date(finishedAt).toISOString();
    }

    await persistCloseRunToPrisma({
      runId,
      status: "DONE",
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
      dataset,
      report,
      orgId: defaultCloseOrgId(),
    });
    await saveRun(runId, {
      status: "DONE",
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
      dataset,
      report,
    });

    latestRunId = runId;
    console.log(
      `  ${runId}  records=${dataset.totals.records}  matched=${dataset.totals.matched}  ` +
        `resolved=${dataset.totals.resolvedPct.toFixed(1)}%  exceptions=${dataset.totals.exceptions}`,
    );
  }

  // Point cockpit run_today at the latest day.
  if (latestRunId) {
    const day = days[days.length - 1];
    const startedAt = day.getTime();
    const finishedAt = startedAt + 8_100;
    const ymd = format(day, "yyyyMMdd");
    const opts = optionsForDay(days.length - 1, ymd);
    const dataset = repairDataset(buildDataset("run_today", startedAt, opts), "run_today");
    const meta = putRunState("run_today", dataset, startedAt, finishedAt);
    const report = getReport("run_today");
    if (report) report.generatedAt = new Date(finishedAt).toISOString();

    await persistCloseRunToPrisma({
      runId: "run_today",
      status: "DONE",
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
      dataset,
      report,
      orgId: defaultCloseOrgId(),
    });
    await saveRun("run_today", {
      status: "DONE",
      startedAt: meta.startedAt,
      finishedAt: meta.finishedAt,
      dataset,
      report,
    });
    console.log(
      `  run_today ← ${latestRunId}  records=${dataset.totals.records}  resolved=${dataset.totals.resolvedPct.toFixed(1)}%`,
    );

    // Portal-style 2B: books keys + a few supplier-only lines so ITC shortfall is visible.
    const books = internalPurchaseRows(dataset.records);
    const standIn = gstr2bFromRecords(dataset.records);
    const extras: GstB2bRow[] = [
      {
        supplierGstin: "27ABCDE1234F1Z5",
        invoiceNo: "INV-2B-MISS-001",
        invoiceDate: format(day, "yyyy-MM-dd"),
        taxablePaise: 200_000,
        taxPaise: 36_000,
        totalPaise: 236_000,
        source: "gstr2b",
      },
      {
        supplierGstin: "29AABCT1332L1ZV",
        invoiceNo: "INV-2B-MISS-002",
        invoiceDate: format(day, "yyyy-MM-dd"),
        taxablePaise: 500_000,
        taxPaise: 90_000,
        totalPaise: 590_000,
        source: "gstr2b",
      },
    ];
    const twoBRows = [...standIn, ...extras];
    await saveGstr2b({
      pulledAt: new Date(finishedAt).toISOString(),
      source: "upload",
      rows: twoBRows,
    });
    console.log(
      `  gstr2b  rows=${twoBRows.length}  books=${books.length}  extras=${extras.length} (portal export)`,
    );
  }

  const after = await listCloseRunsFromPrisma();
  console.log(`\nDone. ${after.length} runs in Postgres:`);
  for (const r of after.slice(0, 20)) {
    console.log(
      `  ${r.id.padEnd(18)} ${r.status.padEnd(8)} records=${r.totals.records}  resolved=${r.totals.resolvedPct.toFixed(1)}%  exc=${r.totals.exceptions}`,
    );
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
