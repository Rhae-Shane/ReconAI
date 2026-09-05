import { getPool } from "@/lib/db";

import { defaultCloseOrgId } from "./org";
import type { Dataset } from "./store";
import type { CloseReport, CloseRunMeta, FinRecord, RunDetail, RunStatus, SourceStat } from "./types";

const SOURCE_KIND = {
  gateway: "razorpay_gateway",
  bank: "bank_utr",
  erp: "erp_orders",
  gst: "gst_invoices",
} as const;

let ensuredDatasetColumn = false;
let ensuredLedger = false;

function toDbStatus(status: string): string {
  if (status === "DONE" || status === "COMPLETED") return "COMPLETED";
  if (status === "FAILED") return "FAILED";
  if (status === "PENDING") return "PENDING";
  return "RUNNING";
}

function fromDbStatus(status: string): RunStatus {
  if (status === "COMPLETED" || status === "DONE") return "DONE";
  if (status === "FAILED") return "FAILED";
  return "RUNNING";
}

function datasetFromJson(value: unknown): Dataset | null {
  if (!value || typeof value !== "object") return null;
  const d = value as Dataset;
  if (!Array.isArray(d.records) || !d.totals) return null;
  return d;
}

function metaFromRow(row: {
  id: string;
  status: string;
  started_at: Date | string;
  finished_at: Date | string | null;
  dataset: unknown;
}): CloseRunMeta {
  const dataset = datasetFromJson(row.dataset);
  const startedAt = new Date(row.started_at).toISOString();
  const finishedAt = row.finished_at ? new Date(row.finished_at).toISOString() : undefined;
  return {
    id: row.id,
    status: fromDbStatus(row.status),
    batchRef: `batch-${row.id}`,
    startedAt,
    finishedAt,
    totals: dataset?.totals ?? {
      records: 0,
      matched: 0,
      exceptions: 0,
      resolvedPct: 0,
      groups: 0,
      judged: 0,
    },
  };
}

function detailFromDataset(meta: CloseRunMeta, dataset: Dataset): RunDetail {
  return {
    meta: { ...meta, totals: dataset.totals },
    sources: dataset.sources,
    groups: dataset.groups,
    flaps: dataset.flaps,
    exceptions: dataset.exceptions,
    settlements: dataset.settlements,
    forecast: dataset.forecast,
    taxMatches: dataset.taxMatches,
    audit: dataset.audit,
    records: dataset.records,
  };
}

async function ensureDatasetColumn(): Promise<void> {
  const pool = getPool();
  if (!pool || ensuredDatasetColumn) return;
  await pool.query("ALTER TABLE close_runs ADD COLUMN IF NOT EXISTS dataset JSONB");
  await pool.query("ALTER TABLE close_runs ADD COLUMN IF NOT EXISTS org_id TEXT");
  ensuredDatasetColumn = true;
}

async function ensureLedgerTables(): Promise<void> {
  const pool = getPool();
  if (!pool || ensuredLedger) return;
  await ensureDatasetColumn();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_groups (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES close_runs(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      method TEXT NOT NULL,
      match_type TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      reason TEXT NOT NULL,
      amount_paise BIGINT NOT NULL,
      value_date TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS match_links (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      record_id TEXT NOT NULL,
      matched_on TEXT NOT NULL,
      match_type TEXT
    );
    CREATE TABLE IF NOT EXISTS exceptions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES close_runs(id) ON DELETE CASCADE,
      record_id TEXT,
      record_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason_code TEXT NOT NULL,
      rationale TEXT NOT NULL,
      candidate_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'OPEN',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES close_runs(id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      record_id TEXT,
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS settlements (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES close_runs(id) ON DELETE CASCADE,
      group_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      settled_at TIMESTAMPTZ,
      amount_paise BIGINT NOT NULL,
      utr TEXT,
      status TEXT NOT NULL DEFAULT 'EXPECTED',
      lag_days INT
    );
    CREATE TABLE IF NOT EXISTS forecast (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES close_runs(id) ON DELETE CASCADE,
      date TIMESTAMPTZ NOT NULL,
      balance_paise BIGINT NOT NULL,
      delta_paise BIGINT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      reconciled_in BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS tax_line_matches (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES close_runs(id) ON DELETE CASCADE,
      record_id TEXT NOT NULL,
      category_code TEXT,
      category_label TEXT,
      matched_by TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      reason TEXT NOT NULL
    );
  `);
  ensuredLedger = true;
}

export async function persistCloseRunToPrisma(input: {
  runId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  dataset: Dataset;
  report: CloseReport | null;
  orgId?: string;
}): Promise<boolean> {
  const pool = getPool();
  if (!pool) return false;
  await ensureLedgerTables();
  const orgId = input.orgId ?? defaultCloseOrgId();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO close_runs (id, status, started_at, finished_at, dataset, created_at, org_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), $6)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         started_at = EXCLUDED.started_at,
         finished_at = EXCLUDED.finished_at,
         dataset = EXCLUDED.dataset,
         org_id = EXCLUDED.org_id`,
      [
        input.runId,
        toDbStatus(input.status),
        new Date(input.startedAt).toISOString(),
        input.finishedAt ? new Date(input.finishedAt).toISOString() : null,
        JSON.stringify(input.dataset),
        orgId,
      ],
    );

    await client.query("DELETE FROM fin_records WHERE run_id = $1", [input.runId]);
    for (const r of input.dataset.records) {
      await insertFinRecord(client, input.runId, r);
    }

    if (input.report) {
      await client.query(
        `INSERT INTO close_reports (
           id, run_id, generated_at, totals, breakdown, unresolved, per_source,
           precision, recall, confidence_bins, audit_count
         ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11)
         ON CONFLICT (run_id) DO UPDATE SET
           generated_at = EXCLUDED.generated_at,
           totals = EXCLUDED.totals,
           breakdown = EXCLUDED.breakdown,
           unresolved = EXCLUDED.unresolved,
           per_source = EXCLUDED.per_source,
           precision = EXCLUDED.precision,
           recall = EXCLUDED.recall,
           confidence_bins = EXCLUDED.confidence_bins,
           audit_count = EXCLUDED.audit_count`,
        [
          `rpt_${input.runId}`,
          input.runId,
          new Date(input.report.generatedAt).toISOString(),
          JSON.stringify(input.report.totals),
          JSON.stringify(input.report.breakdown),
          JSON.stringify(input.report.unresolved),
          JSON.stringify(input.report.perSource),
          input.report.totals.precision ?? null,
          input.report.totals.recall ?? null,
          JSON.stringify(input.report.confidenceBins),
          input.dataset.audit.length,
        ],
      );
    }

    await client.query("COMMIT");
    try {
      await persistRelationalChildren(pool, input.runId, input.dataset);
    } catch (err) {
      console.warn("[close] relational ledger persist skipped", err);
    }
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function insertFinRecord(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  runId: string,
  r: FinRecord,
): Promise<void> {
  const valueDate = new Date(r.ts).toISOString().slice(0, 10);
  await client.query(
    `INSERT INTO fin_records (
       id, run_id, source, kind, source_name, source_ref, value_date, amount_paise,
       currency, counterparty, description, utr, gateway_ref, order_ref, fee_tax_paise, raw
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
    [
      `${runId}:${r.id}`,
      runId,
      SOURCE_KIND[r.source],
      r.kind,
      r.sourceName ?? null,
      r.sourceRef,
      valueDate,
      Math.trunc(r.amountPaise),
      r.currency ?? "INR",
      r.counterparty ?? null,
      r.description ?? null,
      typeof r.raw?.utr === "string" && r.raw.utr ? r.raw.utr : null,
      typeof r.raw?.paymentId === "string" && r.raw.paymentId ? r.raw.paymentId : null,
      typeof r.raw?.orderId === "string" && r.raw.orderId ? r.raw.orderId : null,
      typeof r.raw?.feeTaxPaise === "number" && Number.isFinite(r.raw.feeTaxPaise)
        ? Math.trunc(r.raw.feeTaxPaise)
        : null,
      JSON.stringify(r.raw ?? {}),
    ],
  );
}

export async function listCloseRunsFromPrisma(): Promise<CloseRunMeta[]> {
  const pool = getPool();
  if (!pool) return [];
  await ensureDatasetColumn();
  const { rows } = await pool.query<{
    id: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    dataset: unknown;
  }>(
    `SELECT id, status, started_at, finished_at, dataset
     FROM close_runs
     WHERE org_id = $1 OR org_id IS NULL OR id = 'run_today'
     ORDER BY started_at DESC
     LIMIT 100`,
    [defaultCloseOrgId()],
  );
  return rows.map(metaFromRow);
}

export async function loadCloseRunFromPrisma(runId: string): Promise<RunDetail | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatasetColumn();
  const { rows } = await pool.query<{
    id: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    dataset: unknown;
  }>(
    `SELECT id, status, started_at, finished_at, dataset
     FROM close_runs
     WHERE id = $1 AND (org_id = $2 OR org_id IS NULL OR id = 'run_today')`,
    [runId, defaultCloseOrgId()],
  );
  const row = rows[0];
  if (!row) return null;
  const dataset = datasetFromJson(row.dataset);
  if (!dataset) return null;
  return detailFromDataset(metaFromRow(row), dataset);
}

export async function loadCloseReportFromPrisma(runId: string): Promise<CloseReport | null> {
  const pool = getPool();
  if (!pool) return null;
  const { rows } = await pool.query<{
    generated_at: Date;
    totals: CloseReport["totals"];
    breakdown: CloseReport["breakdown"];
    unresolved: CloseReport["unresolved"];
    per_source: SourceStat[];
    confidence_bins: CloseReport["confidenceBins"] | null;
  }>(
    `SELECT generated_at, totals, breakdown, unresolved, per_source, confidence_bins
     FROM close_reports
     WHERE run_id = $1`,
    [runId],
  );
  const row = rows[0];
  if (!row) return null;
  const fromRun = await loadCloseRunFromPrisma(runId);
  return {
    runId,
    generatedAt: new Date(row.generated_at).toISOString(),
    totals: row.totals,
    breakdown: row.breakdown,
    unresolved: row.unresolved,
    perSource: row.per_source,
    confidenceBins: row.confidence_bins ?? [],
    exceptions: fromRun?.exceptions ?? [],
    groundedRecords: fromRun?.meta.totals.matched ?? 0,
  };
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

async function persistRelationalChildren(db: Queryable, runId: string, dataset: Dataset): Promise<void> {
  await db.query("DELETE FROM match_links WHERE group_id LIKE $1", [`${runId}:%`]);
  await db.query("DELETE FROM match_groups WHERE run_id = $1", [runId]);
  await db.query("DELETE FROM exceptions WHERE run_id = $1", [runId]);
  await db.query("DELETE FROM audit_events WHERE run_id = $1", [runId]);
  await db.query("DELETE FROM settlements WHERE run_id = $1", [runId]);
  await db.query("DELETE FROM forecast WHERE run_id = $1", [runId]);
  await db.query("DELETE FROM tax_line_matches WHERE run_id = $1", [runId]);

  for (const g of dataset.groups) {
    const gid = `${runId}:${g.id}`;
    await db.query(
      `INSERT INTO match_groups (id, run_id, key, method, match_type, confidence, reason, amount_paise, value_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        gid,
        runId,
        g.key,
        g.method,
        g.matchType,
        g.confidence,
        g.reason,
        Math.trunc(g.amountPaise),
        g.ts ? new Date(g.ts) : null,
      ],
    );
    let li = 0;
    for (const link of g.links) {
      await db.query(
        `INSERT INTO match_links (id, group_id, record_id, matched_on, match_type)
         VALUES ($1,$2,$3,$4,$5)`,
        [`${gid}:lnk:${li++}`, gid, `${runId}:${link.recordId}`, link.matchedOn, link.matchType ?? null],
      );
    }
  }

  for (const e of dataset.exceptions) {
    await db.query(
      `INSERT INTO exceptions (id, run_id, record_id, record_json, reason_code, rationale, candidate_ids, status, created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb,$8,$9)`,
      [
        `${runId}:${e.id}`,
        runId,
        e.recordId ? `${runId}:${e.recordId}` : null,
        JSON.stringify(e.recordJson ?? {}),
        e.reasonCode,
        e.rationale,
        JSON.stringify(e.candidateIds ?? []),
        e.status,
        e.createdAt,
      ],
    );
  }

  for (const a of dataset.audit) {
    await db.query(
      `INSERT INTO audit_events (id, run_id, actor_type, actor_id, action, record_id, detail, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        a.id.startsWith(runId) ? a.id : `${runId}:${a.id}`,
        runId,
        a.actorType,
        a.actorId,
        a.action,
        a.recordId ?? null,
        JSON.stringify(a.detail ?? {}),
        a.createdAt,
      ],
    );
  }

  for (const s of dataset.settlements) {
    await db.query(
      `INSERT INTO settlements (id, run_id, group_keys, settled_at, amount_paise, utr, status, lag_days)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8)`,
      [
        `${runId}:${s.id}`,
        runId,
        JSON.stringify([]),
        s.settledAt,
        Math.trunc(s.amountPaise),
        s.utrNumber ?? null,
        s.status,
        s.lagDays ?? null,
      ],
    );
  }

  for (const f of dataset.forecast) {
    await db.query(
      `INSERT INTO forecast (id, run_id, date, balance_paise, delta_paise, confidence, reconciled_in)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        `${runId}:${f.id}`,
        runId,
        f.date,
        Math.trunc(f.balancePaise),
        Math.trunc(f.deltaPaise),
        f.confidence,
        f.reconciledIn,
      ],
    );
  }

  for (const t of dataset.taxMatches) {
    await db.query(
      `INSERT INTO tax_line_matches (id, run_id, record_id, category_code, category_label, matched_by, confidence, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        `${runId}:${t.id}`,
        runId,
        `${runId}:${t.recordId}`,
        t.categoryCode ?? null,
        t.categoryLabel ?? null,
        t.matchedBy,
        t.confidence,
        t.reason,
      ],
    );
  }
}

export async function loadPreferredLiveRun(): Promise<{ meta: CloseRunMeta; dataset: Dataset } | null> {
  const pool = getPool();
  if (!pool) return null;
  await ensureDatasetColumn();
  const orgId = defaultCloseOrgId();
  const { rows } = await pool.query<{
    id: string;
    status: string;
    started_at: Date;
    finished_at: Date | null;
    dataset: unknown;
  }>(
    `SELECT id, status, started_at, finished_at, dataset
     FROM close_runs
     WHERE dataset IS NOT NULL
       AND (id = 'run_today' OR org_id = $1 OR org_id IS NULL)
     ORDER BY CASE WHEN id = 'run_today' THEN 0 ELSE 1 END, started_at DESC
     LIMIT 1`,
    [orgId],
  );
  const row = rows[0];
  if (!row) return null;
  const dataset = datasetFromJson(row.dataset);
  if (!dataset) return null;
  return { meta: metaFromRow(row), dataset };
}
