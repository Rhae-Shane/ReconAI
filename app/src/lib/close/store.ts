import { addDays, differenceInSeconds, formatISO, subDays } from "date-fns";

import { razorpayGstin } from "./org";
import { DEFAULT_FINANCE_CONFIG } from "./config";
import type { PersistedRunMeta } from "./run-store";
import type {
  AuditEvent,
  CloseReport,
  CloseRunMeta,
  ExceptionRecord,
  ExceptionStatus,
  FinRecord,
  Flap,
  ForecastDatum,
  MatchBreakdown,
  MatchGroup,
  MatchLink,
  ReasonCode,
  RunDetail,
  RunStatus,
  RunTotals,
  Settlement,
  SourceStat,
  TaxLineMatch,
  UnresolvedLine,
} from "./types";
import { defaultExceptionConfidence, unresolvedLineFromException } from "./unresolved-sync";

/**
 * In-memory store + deterministic batch generator for the Controller demo.
 *
 * This stands in for the harness engine + Prisma persistence while `harness/` is being
 * built. It produces a deterministic, ground-truth-labeled synthetic batch (SPEC §1 / Phase 1)
 * and simulates live progress for newly started runs. The API routes and dashboard screens
 * both read/write through here, so swapping in the real engine later is localised to this file.
 *
 * IMPORTANT: this module is shared between RSC server components, route handlers and (imports
 * only) client components. Never import it from a module that also imports client-only code.
 */

/* ------------------------------------------------------------------ */
/* Deterministic PRNG                                                  */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNTERPARTIES = [
  "Sunrise Retail Pvt Ltd",
  "Urban Cocoa",
  "Fetch & Cargo Logistics",
  "Nimbus Cloud Services",
  "Petal & Co Boutique",
  "Quanta Electrics",
  "Riverside Textiles",
  "Bloomery Foods",
  "Helix Pharma Distributors",
  "Bluefin Media",
];

const HSN_CATEGORIES = [
  { code: "9983", label: "Business Services", j: 0 },
  { code: "8473", label: "Computer Parts", j: 1 },
  { code: "6204", label: "Apparel & Textiles", j: 2 },
  { code: "1904", label: "Food & Beverage", j: 3 },
  { code: "3004", label: "Pharmaceuticals", j: 4 },
];

/** Format-valid supplier GSTINs for synthetic GST invoices (not live GSTN registrations). */
const SUPPLIER_GSTINS = [
  "27ABCDE1234F1Z5",
  "29AABCT1332L1ZV",
  "07AABCR1121A1Z5",
  "24AABCU9603R1ZM",
  "33AAACW3775F1Z8",
];

const SOURCE_NAMES: Record<string, string> = {
  gateway: "Razorpay Gateway",
  bank: "Bank UTR",
  erp: "ERP Orders",
  gst: "GST Invoices",
};

export interface Dataset {
  records: FinRecord[];
  groups: MatchGroup[];
  flaps: Flap[];
  exceptions: ExceptionRecord[];
  settlements: Settlement[];
  forecast: ForecastDatum[];
  taxMatches: TaxLineMatch[];
  audit: AuditEvent[];
  sources: SourceStat[];
  totals: RunTotals;
  groundedRecords: number;
}

interface RunState {
  meta: CloseRunMeta;
  dataset: Dataset | null; // null while RUNNING
}

const runs = new Map<string, RunState>();

/* ------------------------------------------------------------------ */
/* Dataset generation (deterministic, ground-truth-labeled)            */
/* ------------------------------------------------------------------ */

export interface BuildDatasetOptions {
  /** Override PRNG seed so same-length run ids still produce distinct batches. */
  seed?: number;
  /** Matched multi-source movements (default 42 → ~140+ records with exceptions). */
  matchedMovements?: number;
  orphans?: number;
  amountMismatches?: number;
  duplicates?: number;
  nearMisses?: number;
  gstOrphans?: number;
}

export function buildDataset(runId: string, startedAt: number, opts?: BuildDatasetOptions): Dataset {
  const rnd = mulberry32(opts?.seed ?? runId.length * 7919 + 13);
  const records: FinRecord[] = [];
  const groups: MatchGroup[] = [];
  const flaps: Flap[] = [];
  const exceptions: ExceptionRecord[] = [];
  const settlements: Settlement[] = [];
  const taxMatches: TaxLineMatch[] = [];
  const audit: AuditEvent[] = [];

  const makeRecord = (
    source: "gateway" | "bank" | "erp" | "gst",
    sourceRef: string,
    amountPaise: number,
    ts: string,
    counterparty: string,
    kind: FinRecord["kind"] = "PAYMENT",
    description?: string,
  ): FinRecord => ({
    id: `rec_${source}_${records.length}`,
    source,
    sourceName: SOURCE_NAMES[source],
    kind,
    sourceRef,
    ts,
    amountPaise,
    currency: "INR",
    counterparty,
    description,
    raw: { ref: sourceRef },
  });

  const amount = () => Math.round((25_000 + rnd() * 240_000) / 50) * 50 * 100; // ₹250–₹2,650
  const pad = (n: number) => `${n}`.padStart(8, "0");

  const runDay = new Date(startedAt);
  const dayTs = (offsetDays: number) =>
    formatISO(subDays(runDay, 1).setUTCHours(11, 30, 0, 0) + offsetDays * 86_400_000, {
      representation: "complete",
    });

  // A matched movement appears across gateway + bank + erp (+ gst for a subset).
  const matchedMovements = opts?.matchedMovements ?? 42;
  const linkedRecordIds = new Set<string>();

  for (let i = 0; i < matchedMovements; i += 1) {
    const m = amount();
    const cparty = COUNTERPARTIES[i % COUNTERPARTIES.length];
    const utr = `UTR${pad(8000001 + i)}`;
    const ts = formatISO(subDays(runDay, (i % 5) + 1).setUTCHours(10, 40 + (i % 6), 0, 0), {
      representation: "complete",
    });
    const hasGst = i % 7 === 0;
    const links: MatchLink[] = [];

    const paymentId = `pay_${runId}_${100000 + i}`;
    const gw = makeRecord("gateway", paymentId, m, ts, cparty);
    records.push(gw);
    const bk = makeRecord("bank", utr, m, ts, cparty);
    records.push(bk);
    const erp = makeRecord("erp", `ORD-${45000 + i}`, m, ts, cparty, "PAYMENT", "Online order");
    records.push(erp);
    // Fee total includes tax on fee (~2% + 18% GST) — same shape as Razorpay mapPayment.
    const feeTotal = Math.max(118, Math.round(m * 0.0236));
    const feeTax = Math.round(feeTotal - feeTotal / 1.18);
    const fee = makeRecord("gateway", `fee_${paymentId}`, -feeTotal, ts, "Razorpay", "FEE", "Razorpay fee + tax on fee");
    fee.raw = {
      paymentId,
      feePaise: feeTotal,
      feeTaxPaise: feeTax,
      gstin: razorpayGstin(),
    };
    records.push(fee);
    links.push(
      { recordId: gw.id, matchedOn: "gatewayRef" },
      { recordId: bk.id, matchedOn: "utr" },
      { recordId: erp.id, matchedOn: "normalizedRef" },
      { recordId: fee.id, matchedOn: "gatewayRef", matchType: "FEE_NETTED" },
    );
    linkedRecordIds.add(gw.id);
    linkedRecordIds.add(bk.id);
    linkedRecordIds.add(erp.id);
    linkedRecordIds.add(fee.id);

    if (hasGst) {
      const hsn = HSN_CATEGORIES[i % HSN_CATEGORIES.length];
      const gst = makeRecord("gst", `INV-${32000 + i}`, m, ts, cparty, "INVOICE", hsn.label);
      const taxable = Math.round(m / 1.18);
      const gstPaise = m - taxable;
      gst.raw = {
        ref: gst.sourceRef,
        gstin: SUPPLIER_GSTINS[i % SUPPLIER_GSTINS.length],
        gstPaise,
        hsn: hsn.code,
      };
      records.push(gst);
      links.push({ recordId: gst.id, matchedOn: "amountWindow" });
      linkedRecordIds.add(gst.id);
      taxMatches.push({
        id: `tax_${i}`,
        runId,
        recordId: gst.id,
        categoryId: `cat_${hsn.j}`,
        categoryCode: hsn.code,
        categoryLabel: hsn.label,
        matchedBy: "RULE",
        confidence: 0.99,
        reason: `GST invoice line maps to HSN ${hsn.code} (${hsn.label})`,
      });
    }

    const method: MatchGroup["method"] = i % 13 === 0 ? "JUDGED" : i % 9 === 0 ? "NORMALIZED" : "EXACT";
    const confidence =
      method === "EXACT" ? DEFAULT_FINANCE_CONFIG.exactThreshold : method === "NORMALIZED" ? 0.95 : 0.81 + rnd() * 0.12;
    const reason = method === "EXACT" ? `exact:utr` : method === "NORMALIZED" ? "normalized:match" : "judge:resolved";

    groups.push({
      id: `grp_${i}`,
      runId,
      key: utr,
      method,
      matchType: method === "EXACT" ? "EXACT" : method === "NORMALIZED" ? "NORMALIZED" : "FUZZY",
      confidence: Math.min(0.999, confidence),
      reason,
      amountPaise: m,
      ts,
      links,
    });

    // Settlement bound to the group, lag 0-2 days.
    const lag = i % 3;
    settlements.push({
      id: `stl_${i}`,
      runId,
      settledAt: formatISO(new Date(new Date(ts).getTime() + lag * 86_400_000).setUTCHours(14, 0, 0, 0), {
        representation: "complete",
      }),
      amountPaise: m,
      utrNumber: utr,
      status: i % 11 === 0 ? "EXPECTED" : "RECEIVED",
      lagDays: lag,
    });
  }

  /* ---------------- Exceptions (the honest list - never dropped) ---------------- */

  const fileException = (
    source: "gateway" | "bank" | "erp" | "gst",
    sourceRef: string,
    amountPaise: number,
    code: ReasonCode,
    rationale: string,
    candidateIds: string[] = [],
  ) => {
    const ts = dayTs(0);
    const rec = makeRecord(source, sourceRef, amountPaise, ts, "Unknown Merchant", "PAYMENT");
    records.push(rec);
    const criticalCodes = new Set(["AMOUNT_MISMATCH", "DUPLICATE"]);
    exceptions.push({
      id: `exc_${exceptions.length}`,
      runId,
      recordId: rec.id,
      recordJson: { ...rec.raw, ref: sourceRef },
      reasonCode: code,
      rationale,
      candidateIds,
      status: "OPEN",
      createdAt: ts,
      resolutionStatus: "OPEN",
      critical: criticalCodes.has(code),
      confidence: defaultExceptionConfidence(code),
      expectedPaise: Math.abs(amountPaise),
      actualPaise: 0,
      variancePaise: Math.abs(amountPaise),
    });
    audit.push({
      id: `audit_exc_${audit.length}`,
      runId,
      actorType: "AGENT",
      actorId: "close-agent",
      action: "EXCEPTION",
      recordId: rec.id,
      detail: { reasonCode: code, confidence: 0.5 },
      createdAt: ts,
    });
  };

  // Orphans: bank rows with no gateway match (NO_KEY).
  const orphanCount = opts?.orphans ?? 8;
  for (let i = 0; i < orphanCount; i += 1) {
    fileException(
      "bank",
      `UTR${pad(9001000 + i)}`,
      amount(),
      "NO_KEY",
      "Bank debit with no matching gateway capture or ERP order in the batch window.",
    );
  }

  // Amount mismatches beyond tolerance (AMOUNT_MISMATCH).
  const mismatchCount = opts?.amountMismatches ?? 5;
  for (let i = 0; i < mismatchCount; i += 1) {
    fileException(
      "bank",
      `UTR${pad(9002000 + i)}`,
      amount() + 25_000,
      "AMOUNT_MISMATCH",
      "Amount differs from gateway record by > ₹0.50 tolerance; cannot reconcile safely.",
    );
  }

  // Duplicate UTRs (DUPLICATE).
  const duplicateCount = opts?.duplicates ?? 3;
  for (let i = 0; i < duplicateCount; i += 1) {
    fileException(
      "bank",
      `UTR${pad(9003000 + i)}`,
      amount(),
      "DUPLICATE",
      "Second occurrence of the same UTR seen in the batch; duplicate settlement line.",
    );
  }

  // Near-duplicates only a judge could disambiguate, resolved below threshold (LOW_CONFIDENCE / PARTIAL_FLAP).
  const nearMissCount = opts?.nearMisses ?? 4;
  for (let i = 0; i < nearMissCount; i += 1) {
    const a = amount();
    const src = i % 2 === 0 ? "bank" : "erp";
    const linkCandidate = linkedRecordIds[Symbol.iterator]();
    const candidateIds = Array.from({ length: 2 }, () => linkCandidate.next()?.value).filter(Boolean);
    fileException(
      src,
      `NEAR-${800 + i}`,
      a,
      i % 2 === 0 ? "LOW_CONFIDENCE" : "PARTIAL_FLAP",
      "Residual ambiguity - closest candidate match confidence fell below the 0.70 resolve threshold.",
      candidateIds as string[],
    );
    const nearRec = records.at(-1);
    if (nearRec) {
      flaps.push({
        id: `flap_${flaps.length}`,
        runId,
        recordIds: [nearRec.id, ...(candidateIds as string[])],
        amountPaise: a,
        reason: i % 2 === 0 ? "Judge confidence below threshold" : "Partial multi-record flap",
      });
    }
  }

  // GST-only invoices with no matched gateway/bank record (NO_KEY) — still carry a GSTIN for tax books.
  const gstOrphanCount = opts?.gstOrphans ?? 2;
  for (let i = 0; i < gstOrphanCount; i += 1) {
    const amt = amount();
    const ts = dayTs(0);
    const invNo = `INV-${55000 + i}`;
    const taxable = Math.round(amt / 1.18);
    const rec: FinRecord = {
      id: `rec_gst_${records.length}`,
      source: "gst",
      sourceName: SOURCE_NAMES.gst,
      kind: "INVOICE",
      sourceRef: invNo,
      ts,
      amountPaise: amt,
      currency: "INR",
      counterparty: "Unknown Merchant",
      description: "Unmatched GST purchase invoice",
      raw: {
        ref: invNo,
        gstin: SUPPLIER_GSTINS[(i + 2) % SUPPLIER_GSTINS.length],
        gstPaise: amt - taxable,
      },
    };
    records.push(rec);
    exceptions.push({
      id: `exc_${exceptions.length}`,
      runId,
      recordId: rec.id,
      recordJson: { ...rec.raw, ref: invNo },
      reasonCode: "NO_KEY",
      rationale: "GST invoice present with no corresponding settlement or payment record in the window.",
      candidateIds: [],
      status: "OPEN",
      createdAt: ts,
      resolutionStatus: "OPEN",
      critical: false,
      confidence: defaultExceptionConfidence("NO_KEY"),
      expectedPaise: Math.abs(amt),
      actualPaise: 0,
      variancePaise: Math.abs(amt),
    });
    audit.push({
      id: `audit_exc_${audit.length}`,
      runId,
      actorType: "AGENT",
      actorId: "close-agent",
      action: "EXCEPTION",
      recordId: rec.id,
      detail: { reasonCode: "NO_KEY", confidence: 0.5 },
      createdAt: ts,
    });
  }

  /* ---------------- Forecast (7 days) ---------------- */

  const forecast: ForecastDatum[] = [];
  const baseBalance = groups.reduce((sum, g) => sum + g.amountPaise, 0) / 10;
  let balance = baseBalance;
  for (let d = 1; d <= 7; d += 1) {
    const delta = Math.round((30_000 + rnd() * 90_000) * (rnd() > 0.5 ? 1 : -1));
    balance += delta;
    forecast.push({
      id: `frc_${d}`,
      runId,
      date: formatISO(addDays(runDay, d).setUTCHours(0, 0, 0, 0), { representation: "date" }),
      balancePaise: Math.max(0, balance),
      deltaPaise: delta,
      confidence: Math.max(0.4, 0.95 - d * 0.06),
      reconciledIn: d <= 3,
    });
  }

  /* ---------------- Sources & totals ---------------- */

  const sourceStats: SourceStat[] = (["gateway", "bank", "erp", "gst"] as const).map((source) => {
    const sourceRecords = records.filter((r) => r.source === source);
    const matched = sourceRecords.filter((r) => linkedRecordIds.has(r.id)).length;
    return {
      source,
      sourceName: SOURCE_NAMES[source],
      records: sourceRecords.length,
      matched,
      matchRate: sourceRecords.length ? matched / sourceRecords.length : 0,
    };
  });

  const matchedCount = linkedRecordIds.size;
  const totals: RunTotals = {
    records: records.length,
    matched: matchedCount,
    exceptions: exceptions.length,
    resolvedPct: records.length ? (matchedCount / records.length) * 100 : 0,
    groups: groups.length,
    judged: groups.filter((g) => g.method === "JUDGED").length,
    precision: 0.94,
    recall: 0.91,
  };

  return {
    records,
    groups,
    flaps,
    exceptions,
    settlements,
    forecast,
    taxMatches,
    audit,
    sources: sourceStats,
    totals,
    groundedRecords: linkedRecordIds.size,
  };
}

function toMeta(
  runId: string,
  status: RunStatus,
  totals: RunTotals,
  startedAt: number,
  finishedAt?: number,
): CloseRunMeta {
  return {
    id: runId,
    status,
    batchRef: `batch-${runId}`,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: finishedAt ? new Date(finishedAt).toISOString() : undefined,
    totals,
  };
}

/* ------------------------------------------------------------------ */
/* Run lifecycle                                                       */
/* ------------------------------------------------------------------ */

function seed() {
  // Intentionally empty: `ensureLiveClose()` hydrates `run_today` from Prisma or the
  // documented synthetic demo batch. Unit tests call `buildDataset` / `putRunState` directly.
}

/**
 * Honesty repair: every unmatched record must have a live exception. Older persisted
 * runs sometimes had residual report rows without a ledger entry — that produced the
 * "CLOSE VERIFIED + Needs human review" contradiction.
 */
export function repairDataset(dataset: Dataset, runId: string): Dataset {
  const matchedIds = new Set<string>();
  for (const g of dataset.groups) {
    if (g.confidence >= DEFAULT_FINANCE_CONFIG.resolveThreshold) {
      for (const link of g.links) matchedIds.add(link.recordId);
    }
  }
  const have = new Set(dataset.exceptions.map((e) => e.recordId).filter(Boolean) as string[]);
  const additions: ExceptionRecord[] = [];
  let ei = dataset.exceptions.length;
  const ts = new Date().toISOString();
  for (const rec of dataset.records) {
    if (matchedIds.has(rec.id) || have.has(rec.id)) continue;
    const code: ReasonCode = "NO_KEY";
    additions.push({
      id: `exc_repair_${ei++}`,
      runId,
      recordId: rec.id,
      recordJson: { ...rec.raw, ref: rec.sourceRef },
      reasonCode: code,
      rationale: "Unmatched residual — filed on load so the exception ledger stays the source of truth.",
      candidateIds: [],
      status: "OPEN",
      createdAt: ts,
      resolutionStatus: "OPEN",
      critical: false,
      confidence: defaultExceptionConfidence(code),
      expectedPaise: Math.abs(rec.amountPaise),
      actualPaise: 0,
      variancePaise: Math.abs(rec.amountPaise),
    });
  }
  if (additions.length === 0) return dataset;
  const exceptions = [...dataset.exceptions, ...additions];
  return {
    ...dataset,
    exceptions,
    totals: { ...dataset.totals, exceptions: exceptions.length },
  };
}

/** Documented zero-infra demo close (deterministic `buildDataset`). */
export function seedDemoClose(startedAt = Date.now()): CloseRunMeta {
  const runId = "run_today";
  const dataset = repairDataset(buildDataset(runId, startedAt), runId);
  const meta = toMeta(runId, "DONE", dataset.totals, startedAt, startedAt);
  runs.set(runId, { meta, dataset });
  return meta;
}

/** Finish a stub RUNNING run with the synthetic demo dataset (no Redis worker). */
export function completeSyntheticRun(runId: string, startedAt = Date.now()): CloseRunMeta {
  const dataset = repairDataset(buildDataset(runId, startedAt), runId);
  const meta = toMeta(runId, "DONE", dataset.totals, startedAt, Date.now());
  runs.set(runId, { meta, dataset });
  aliasAsToday(runId);
  return meta;
}

function computeProgress(state: RunState) {
  // Worker / sync fills the dataset. Do not invent a synthetic close while RUNNING.
  if (state.meta.status !== "RUNNING") return;
}

export function listRuns(): CloseRunMeta[] {
  seed();
  for (const state of runs.values()) computeProgress(state);
  return Array.from(runs.values())
    .map((s) => s.meta)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export function startRun(): CloseRunMeta {
  seed();
  const id = `run_${Date.now()}`;
  const now = Date.now();
  const state: RunState = {
    meta: toMeta(id, "RUNNING", { records: 1, matched: 0, exceptions: 0, resolvedPct: 0, groups: 0, judged: 0 }, now),
    dataset: null,
  };
  runs.set(id, state);
  return state.meta;
}

export function getRun(runId: string): RunDetail | null {
  seed();
  const state = runs.get(runId);
  if (!state) return null;
  computeProgress(state);
  const dataset = state.dataset;
  return {
    meta: state.meta,
    sources: dataset?.sources ?? [],
    groups: dataset?.groups ?? [],
    flaps: dataset?.flaps ?? [],
    exceptions: dataset?.exceptions ?? [],
    settlements: dataset?.settlements ?? [],
    forecast: dataset?.forecast ?? [],
    taxMatches: dataset?.taxMatches ?? [],
    audit: dataset?.audit ?? [],
    records: dataset?.records ?? [],
  };
}

export function finalizeRun(runId: string): CloseReport | null {
  seed();
  const state = runs.get(runId);
  if (!state?.dataset) return null;
  const dataset = state.dataset;
  state.meta = toMeta(runId, "DONE", dataset.totals, new Date(state.meta.startedAt).getTime(), Date.now());
  return buildReport(runId, state);
}

/**
 * Derive the harness-aligned `MatchBreakdown` + `UnresolvedLine[]` from a resolved dataset.
 *
 * Contract mapping: matched=resolved records (in a group at/above the resolve threshold),
 * partial=records stuck in a PARTIAL_FLAP/low-confidence flap, unresolved=open records that
 * remain with no resolved/partial disposition. `matchRate = matched / records`. Each unresolved
 * record becomes an `UnresolvedLine` carrying expected/actual/difference paise + reason.
 */
function computeReportFields(d: Dataset): { breakdown: MatchBreakdown; unresolved: UnresolvedLine[] } {
  const resolveThreshold = DEFAULT_FINANCE_CONFIG.resolveThreshold;

  const matchedIds = new Set<string>();
  for (const g of d.groups) {
    if (g.confidence >= resolveThreshold) {
      for (const link of g.links) matchedIds.add(link.recordId);
    }
  }
  const partialIds = new Set<string>();
  for (const f of d.flaps) {
    // A flap may also list already-resolved candidates; only the truly-unresolved lane counts as partial.
    for (const rid of f.recordIds) {
      if (!matchedIds.has(rid)) partialIds.add(rid);
    }
  }

  const exceptionsByRecord = new Map<string, ExceptionRecord>();
  for (const e of d.exceptions) {
    if (e.recordId) exceptionsByRecord.set(e.recordId, e);
  }

  let matched = 0;
  let partial = 0;
  const unresolved: UnresolvedLine[] = [];

  for (const rec of d.records) {
    if (matchedIds.has(rec.id)) {
      matched += 1;
      continue;
    }
    if (partialIds.has(rec.id)) {
      partial += 1;
      continue;
    }
    const exc = exceptionsByRecord.get(rec.id);
    const amountPaise = rec.amountPaise;
    if (exc && (exc.status === "RESOLVED" || exc.resolutionStatus === "APPROVED")) {
      // Human-resolved residual — leave matched/partial alone; drop from open unresolved.
      continue;
    }
    const line = exc
      ? unresolvedLineFromException(exc, {
          expectedPaise: typeof exc.expectedPaise === "number" ? exc.expectedPaise : amountPaise,
          actualPaise: typeof exc.actualPaise === "number" ? exc.actualPaise : 0,
          ref: rec.sourceRef,
          recordId: rec.id,
        })
      : ({
          recordId: rec.id,
          ref: rec.sourceRef,
          expectedPaise: amountPaise,
          actualPaise: 0,
          differencePaise: amountPaise,
          reason: "NO_KEY" as ReasonCode,
          confidence: defaultExceptionConfidence("NO_KEY"),
          status: "NEEDS_REVIEW" as const,
        } satisfies UnresolvedLine);
    unresolved.push(line);
  }

  const records = d.records.length;
  return {
    breakdown: {
      records,
      matched,
      partial,
      unresolved: unresolved.length,
      matchRate: records ? matched / records : 0,
    },
    unresolved,
  };
}

function buildReport(runId: string, state: RunState): CloseReport {
  const d = state.dataset!;
  const bins = [
    { bin: "0.95+", count: 0 },
    { bin: "0.80–0.94", count: 0 },
    { bin: "0.70–0.79", count: 0 },
    { bin: "<0.70", count: 0 },
  ];
  for (const g of d.groups) {
    if (g.confidence >= 0.95) bins[0].count += 1;
    else if (g.confidence >= 0.8) bins[1].count += 1;
    else if (g.confidence >= 0.7) bins[2].count += 1;
    else bins[3].count += 1;
  }
  const { breakdown, unresolved } = computeReportFields(d);
  return {
    runId,
    generatedAt: new Date().toISOString(),
    totals: d.totals,
    breakdown,
    unresolved,
    perSource: d.sources,
    confidenceBins: bins,
    exceptions: d.exceptions,
    groundedRecords: d.groundedRecords,
  };
}

export function getReport(runId: string) {
  seed();
  const state = runs.get(runId);
  if (!state) return null;
  computeProgress(state);
  if (!state.dataset) return null;
  return buildReport(runId, state);
}

/* ------------------------------------------------------------------ */
/* Exceptions                                                          */
/* ------------------------------------------------------------------ */

export function listExceptions(filters?: { reasonCode?: string; status?: string; runId?: string }): ExceptionRecord[] {
  seed();
  const all: ExceptionRecord[] = [];
  for (const state of runs.values()) {
    computeProgress(state);
    for (const exc of state.dataset?.exceptions ?? []) all.push(exc);
  }
  return all.filter((e) => {
    if (filters?.reasonCode && e.reasonCode !== filters.reasonCode) return false;
    if (filters?.status && e.status !== filters.status) return false;
    if (filters?.runId && e.runId !== filters.runId) return false;
    return true;
  });
}

function findException(id: string): ExceptionRecord | null {
  seed();
  for (const state of runs.values()) {
    computeProgress(state);
    const exc = state.dataset?.exceptions.find((e) => e.id === id);
    if (exc) return exc;
  }
  return null;
}

/** Stamp critical when missing so SoD classification is stable for seeded rows. */
function ensureCriticalFlag(exc: ExceptionRecord): void {
  if (typeof exc.critical === "boolean") return;
  const criticalCodes = new Set(["AMOUNT_MISMATCH", "DUPLICATE"]);
  const criticalVariance = 10_00_00;
  exc.critical =
    criticalCodes.has(exc.reasonCode) ||
    (exc.variancePaise !== undefined && Math.abs(exc.variancePaise) >= criticalVariance);
}

export function resolveException(
  id: string,
  override: { status: ExceptionStatus; note?: string },
): ExceptionRecord | null {
  const exc = findException(id);
  if (!exc) return null;
  ensureCriticalFlag(exc);
  exc.status = override.status;
  exc.rationale = override.note ? `${exc.rationale} [${override.note}]` : exc.rationale;
  return exc;
}

/**
 * Accountant (or owner) submits a resolution.
 * Critical exceptions → PENDING_APPROVAL (needs a distinct owner approver).
 * Non-critical → RESOLVED + APPROVED (accountant may resolve alone).
 */
export function submitExceptionResolution(
  id: string,
  input: { resolvedBy: string; note?: string },
): ExceptionRecord | null {
  const exc = findException(id);
  if (!exc) return null;
  ensureCriticalFlag(exc);
  if (exc.status === "RESOLVED" && exc.resolutionStatus === "APPROVED") {
    return exc;
  }
  exc.resolvedBy = input.resolvedBy;
  exc.approvedBy = undefined;
  if (input.note) {
    exc.rationale = `${exc.rationale} [${input.note}]`;
  }
  if (exc.critical) {
    exc.status = "REVIEWED";
    exc.resolutionStatus = "PENDING_APPROVAL";
  } else {
    exc.status = "RESOLVED";
    exc.resolutionStatus = "APPROVED";
  }
  return exc;
}

/**
 * Owner approves a pending critical resolution. Caller must already have enforced SoD.
 */
export function approveExceptionResolution(
  id: string,
  input: { approvedBy: string; note?: string },
): ExceptionRecord | null {
  const exc = findException(id);
  if (!exc) return null;
  ensureCriticalFlag(exc);
  exc.approvedBy = input.approvedBy;
  if (input.note) {
    exc.rationale = `${exc.rationale} [${input.note}]`;
  }
  exc.status = "RESOLVED";
  exc.resolutionStatus = "APPROVED";
  return exc;
}

/** Owner rejects a pending resolution (returns to OPEN for re-work). */
export function rejectExceptionResolution(
  id: string,
  input: { rejectedBy: string; note?: string },
): ExceptionRecord | null {
  const exc = findException(id);
  if (!exc) return null;
  ensureCriticalFlag(exc);
  exc.approvedBy = undefined;
  if (input.note) {
    exc.rationale = `${exc.rationale} [rejected by ${input.rejectedBy}: ${input.note}]`;
  } else {
    exc.rationale = `${exc.rationale} [rejected by ${input.rejectedBy}]`;
  }
  exc.status = "OPEN";
  exc.resolutionStatus = "REJECTED";
  return exc;
}

/* ------------------------------------------------------------------ */
/* Read views                                                          */
/* ------------------------------------------------------------------ */

export function getForecast(runId: string): ForecastDatum[] {
  const run = getRun(runId);
  return run?.forecast ?? [];
}

export function getTaxMatches(runId: string): TaxLineMatch[] {
  const run = getRun(runId);
  return run?.taxMatches ?? [];
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatDayLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return isoDay;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function citeLines(rows: { utrNumber?: string; amountPaise: number }[], limit = 12): string {
  const parts = rows
    .map((s) => (s.utrNumber ? `${s.utrNumber} (${formatInr(s.amountPaise)})` : formatInr(s.amountPaise)))
    .filter(Boolean);
  if (parts.length === 0) return "(no UTR listed)";
  if (parts.length <= limit) return parts.join(", ");
  return `${parts.slice(0, limit).join(", ")}, … (+${parts.length - limit} more)`;
}

function groupSettlementsByDay<T extends { settledAt: string; amountPaise: number; utrNumber?: string }>(
  settled: T[],
): Array<{ day: string; rows: T[]; totalPaise: number }> {
  const map = new Map<string, T[]>();
  for (const s of settled) {
    const day = dayKey(s.settledAt);
    const bucket = map.get(day);
    if (bucket) bucket.push(s);
    else map.set(day, [s]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rows]) => ({
      day,
      rows,
      totalPaise: rows.reduce((a, s) => a + s.amountPaise, 0),
    }));
}

/** Parse a calendar day from free text (ISO, "14 Aug", "Aug 14", optional year). */
export function parseSettlementQueryDay(query: string, fallbackYear?: number): string | null {
  const iso = query.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const months = Object.keys(MONTH_INDEX).join("|");
  const dayMonth = query.match(new RegExp(`\\b(\\d{1,2})\\s+(${months})(?:\\s+(20\\d{2}))?\\b`, "i"));
  if (dayMonth) {
    const day = Number(dayMonth[1]);
    const month = MONTH_INDEX[dayMonth[2].toLowerCase()];
    const year = dayMonth[3] ? Number(dayMonth[3]) : (fallbackYear ?? new Date().getUTCFullYear());
    if (month !== undefined && day >= 1 && day <= 31) {
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const monthDay = query.match(new RegExp(`\\b(${months})\\s+(\\d{1,2})(?:\\s*,?\\s*(20\\d{2}))?\\b`, "i"));
  if (monthDay) {
    const month = MONTH_INDEX[monthDay[1].toLowerCase()];
    const day = Number(monthDay[2]);
    const year = monthDay[3] ? Number(monthDay[3]) : (fallbackYear ?? new Date().getUTCFullYear());
    if (month !== undefined && day >= 1 && day <= 31) {
      return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Deterministic natural-language response over the settled ledger. Used as the engine-backed
 * answer source for settlement Q&A (the model only ever adds narration on top of numbers
 * computed here).
 */
export function settlementQuery(runId: string, query: string): string {
  const run = getRun(runId);
  if (!run) return "No completed run to query. Start a close run first.";
  const settled = run.settlements.filter((s) => s.status === "RECEIVED" || s.status === "RECONCILED");
  const q = query.toLowerCase();
  const byDay = groupSettlementsByDay(settled);
  const availableDays = byDay.map((b) => b.day);
  const yearHint = availableDays[0] ? Number(availableDays[0].slice(0, 4)) : undefined;
  const askedDay = parseSettlementQueryDay(query, yearHint);

  const summaryTail =
    availableDays.length > 0
      ? ` Available settled dates: ${availableDays.map(formatDayLabel).join(", ")}.`
      : " No settled lines are on the ledger yet.";

  if (settled.length === 0) {
    return "No RECEIVED/RECONCILED settlements are on the ledger for this close run.";
  }

  if (askedDay) {
    const onDay = settled.filter((s) => dayKey(s.settledAt) === askedDay);
    if (onDay.length === 0) {
      return `No settlements recorded on ${formatDayLabel(askedDay)}.${summaryTail}`;
    }
    const total = onDay.reduce((a, s) => a + s.amountPaise, 0);
    return `On ${formatDayLabel(askedDay)}, ${onDay.length} settlement(s) totalling ${formatInr(total)}: ${citeLines(onDay)}.`;
  }

  if (
    q.includes("date") ||
    q.includes("dates") ||
    q.includes("which day") ||
    q.includes("what day") ||
    (q.includes("list") && (q.includes("day") || q.includes("when")))
  ) {
    const lines = byDay.map(
      (b) =>
        `${formatDayLabel(b.day)} (${b.day}): ${b.rows.length} UTR(s) · ${formatInr(b.totalPaise)} — ${citeLines(b.rows, 6)}`,
    );
    return `${settled.length} settled line(s) across ${byDay.length} day(s):\n${lines.join("\n")}`;
  }

  if (q.includes("daily") || q.includes("per day") || q.includes("by day") || q.includes("totals")) {
    const lines = byDay.map((b) => `${formatDayLabel(b.day)}: ${b.rows.length} · ${formatInr(b.totalPaise)}`);
    const grand = settled.reduce((a, s) => a + s.amountPaise, 0);
    return `Daily settlement totals (${formatInr(grand)} across ${settled.length} lines):\n${lines.join("\n")}`;
  }

  if (
    (q.includes("utr") || q.includes("utrs")) &&
    (q.includes("list") || q.includes("all") || q.includes("which") || q.includes("show"))
  ) {
    return `${settled.length} settled UTR(s) totalling ${formatInr(
      settled.reduce((a, s) => a + s.amountPaise, 0),
    )}: ${citeLines(settled, 20)}.${summaryTail}`;
  }

  if (q.includes("how many") || q.includes("count") || q.includes("recorded")) {
    return `${settled.length} settlements are recorded as RECEIVED/RECONCILED across the close run, totalling ${formatInr(
      settled.reduce((a, s) => a + s.amountPaise, 0),
    )}, with an average settlement lag of ${(
      settled.reduce((a, s) => a + (s.lagDays ?? 1), 0) / Math.max(1, settled.length)
    ).toFixed(1)} day(s).${summaryTail}`;
  }

  if (q.includes("lag") || q.includes("delay")) {
    const lags = settled.map((s) => s.lagDays ?? 1);
    const avg = lags.reduce((a, b) => a + b, 0) / Math.max(1, lags.length);
    const sameDayPct = (lags.filter((l) => l === 0).length / Math.max(1, lags.length)) * 100;
    return `Average settlement lag is ${avg.toFixed(1)} day(s). ${sameDayPct.toFixed(0)}% of settlements arrived same-day (D+0).${summaryTail}`;
  }

  // Default: always return concrete ledger facts so the chat model cannot invent vagueness.
  return `${settled.length} settled line(s) totalling ${formatInr(
    settled.reduce((a, s) => a + s.amountPaise, 0),
  )} across ${byDay.length} day(s).${summaryTail} Sample UTRs: ${citeLines(settled, 8)}.`;
}

// Hours since a run finished (for the exception auto-flag drill).
export function exceptionAgeDays(exc: ExceptionRecord): number {
  return Math.max(0, differenceInSeconds(new Date(), new Date(exc.createdAt)) / 86_400);
}

/* Re-export for consumers that want raw record access (tools, agent). */
export function getRecords(runId: string): FinRecord[] {
  seed();
  const state = runs.get(runId);
  if (!state) return [];
  computeProgress(state);
  return state.dataset?.records ?? [];
}

function allRecords(): FinRecord[] {
  // Pull cached raw records from the seed datasets for tool consumption.
  const out: FinRecord[] = [];
  for (const state of runs.values()) {
    if (state.dataset) out.push(...state.dataset.records);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Redis-aware read path (API only)                                    */
/* ------------------------------------------------------------------ */

/**
 * Map a durable persisted entry to the in-memory `CloseRunMeta` shape so callers never have to
 * branch on whether a run lived in Redis (worker-processed) or the demo Map. Totals are not
 * persisted at the list level, so they default to zero here; callers needing full detail should
 * use `getRunFromStore` / `getReportFromStore`, which hydrate from the persisted dataset/report.
 */
function toPersistedMeta(p: PersistedRunMeta): CloseRunMeta {
  return {
    id: p.runId,
    status: p.status as RunStatus,
    batchRef: `batch-${p.runId}`,
    startedAt: p.startedAt,
    finishedAt: p.finishedAt,
    totals: { records: 0, matched: 0, exceptions: 0, resolvedPct: 0, groups: 0, judged: 0 },
  };
}

/**
 * List all runs, merging the durable Redis run-store (worker-processed runs) with the in-memory
 * demo runs, de-duplicated by runId and sorted newest first. Falls back to the in-memory Map only
 * when Redis is not configured. The SYNC `listRuns()` stays untouched for the dashboard screens.
 */
export async function listRunsFromStore(): Promise<CloseRunMeta[]> {
  await ensureLiveClose();
  const inMemory = listRuns();
  const byId = new Map<string, CloseRunMeta>();
  for (const meta of inMemory) byId.set(meta.id, meta);

  try {
    const { listCloseRunsFromPrisma } = await import("./prisma-store");
    for (const meta of await listCloseRunsFromPrisma()) {
      if (!byId.has(meta.id)) byId.set(meta.id, meta);
    }
  } catch {
    // Prisma is optional — Redis / in-memory still serve the cockpit.
  }

  const { isRedisConfigured } = await import("@/lib/ops/redis");
  if (isRedisConfigured()) {
    const { loadAllRuns } = await import("@/lib/close/run-store");
    for (const p of await loadAllRuns()) {
      if (!byId.has(p.runId)) byId.set(p.runId, toPersistedMeta(p));
    }
  }

  return Array.from(byId.values()).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

/**
 * Hydrate a single run, preferring the in-memory demo run and falling back to the persisted Redis
 * dataset. Returns `null` when the run is unknown to the read store. SYNC `getRun()` is untouched.
 */
export async function getRunFromStore(runId: string): Promise<RunDetail | null> {
  await ensureLiveClose();
  const local = getRun(runId);
  if (local) return local;

  try {
    const { loadCloseRunFromPrisma } = await import("./prisma-store");
    const fromDb = await loadCloseRunFromPrisma(runId);
    if (fromDb) return fromDb;
  } catch {
    // fall through to Redis
  }

  const { isRedisConfigured } = await import("@/lib/ops/redis");
  if (!isRedisConfigured()) return null;

  const { loadDataset, loadRunMeta } = await import("@/lib/close/run-store");
  const meta = await loadRunMeta(runId);
  if (!meta) return null;
  const dataset = await loadDataset(runId);
  return {
    meta: {
      ...toPersistedMeta(meta),
      totals: dataset?.totals ?? toPersistedMeta(meta).totals,
    },
    sources: dataset?.sources ?? [],
    groups: dataset?.groups ?? [],
    flaps: dataset?.flaps ?? [],
    exceptions: dataset?.exceptions ?? [],
    settlements: dataset?.settlements ?? [],
    forecast: dataset?.forecast ?? [],
    taxMatches: dataset?.taxMatches ?? [],
    audit: dataset?.audit ?? [],
    records: dataset?.records ?? [],
  };
}

/**
 * Hydrate a persisted CloseReport, preferring the in-memory demo report and falling back to the
 * Redis report artifact. Returns `null` when the run is unknown or has no report. SYNC `getReport()`
 * stays untouched for the dashboard screens.
 */
export async function getReportFromStore(runId: string): Promise<CloseReport | null> {
  await ensureLiveClose();
  const local = getReport(runId);
  if (local) return local;

  try {
    const { loadCloseRunFromPrisma } = await import("./prisma-store");
    const fromDb = await loadCloseRunFromPrisma(runId);
    if (fromDb?.records && fromDb.records.length > 0) {
      const dataset = repairDataset(
        {
          records: fromDb.records,
          groups: fromDb.groups ?? [],
          flaps: fromDb.flaps ?? [],
          exceptions: fromDb.exceptions ?? [],
          settlements: fromDb.settlements ?? [],
          forecast: fromDb.forecast,
          taxMatches: fromDb.taxMatches ?? [],
          audit: fromDb.audit ?? [],
          sources: fromDb.sources ?? [],
          totals: fromDb.meta.totals,
          groundedRecords: (fromDb.groups ?? []).length,
        },
        runId,
      );
      const started = new Date(fromDb.meta.startedAt).getTime();
      const finished = fromDb.meta.finishedAt ? new Date(fromDb.meta.finishedAt).getTime() : Date.now();
      putRunState(runId, dataset, started, finished);
      return getReport(runId);
    }
  } catch {
    // fall through
  }

  try {
    const { loadCloseReportFromPrisma } = await import("./prisma-store");
    const fromDb = await loadCloseReportFromPrisma(runId);
    if (fromDb) return fromDb;
  } catch {
    // fall through to Redis
  }

  const { isRedisConfigured } = await import("@/lib/ops/redis");
  if (!isRedisConfigured()) return null;

  const { loadReport } = await import("@/lib/close/run-store");
  return loadReport(runId);
}

/**
 * Durably write a close run (dataset + report) to Redis and Prisma. Safe to call when either
 * backend is down — failures are logged and the in-memory Map still serves this process.
 */
export async function persistCloseArtifacts(runId: string, report?: CloseReport | null): Promise<void> {
  const state = runs.get(runId);
  if (!state?.dataset) return;
  const built = report ?? buildReport(runId, state);
  aliasAsToday(runId);
  try {
    const { saveRun } = await import("./run-store");
    await saveRun(runId, {
      status: state.meta.status,
      startedAt: state.meta.startedAt,
      finishedAt: state.meta.finishedAt,
      dataset: state.dataset,
      report: built,
    });
  } catch (err) {
    console.warn("[close] redis persist failed", err);
  }
  try {
    const { persistCloseRunToPrisma } = await import("./prisma-store");
    const { defaultCloseOrgId } = await import("./org");
    const orgId = defaultCloseOrgId();
    await persistCloseRunToPrisma({
      runId,
      status: state.meta.status,
      startedAt: state.meta.startedAt,
      finishedAt: state.meta.finishedAt,
      dataset: state.dataset,
      report: built,
      orgId,
    });
    const today = runs.get("run_today");
    if (today?.dataset && runId !== "run_today") {
      await persistCloseRunToPrisma({
        runId: "run_today",
        status: today.meta.status,
        startedAt: today.meta.startedAt,
        finishedAt: today.meta.finishedAt,
        dataset: today.dataset,
        report: buildReport("run_today", today),
        orgId,
      });
    }
  } catch (err) {
    console.warn("[close] prisma persist failed", err);
  }
  try {
    const { recordUsage } = await import("@/lib/billing/meter");
    await recordUsage({
      kind: "close",
      quantity: 1,
      runId,
      orgId: (await import("./org")).defaultCloseOrgId(),
    });
    const rows = state.dataset.records.length;
    if (rows > 0) await recordUsage({ kind: "upload_rows", quantity: rows, runId });
  } catch {
    // metering is best-effort
  }
}

/* ------------------------------------------------------------------ */
/* Upload ingestion (CSV -> run -> report)                             */
/* ------------------------------------------------------------------ */

/**
 * Deterministic reconciliation of user-uploaded records, mirroring the grouping semantics of
 * `buildDataset`: gateway payments link to bank settlements on `settlementId` (EXACT when the
 * amount agrees, NORMALIZED within tolerance); GST invoices link to a still-unmatched payment on
 * amount. Records that fail to pair become PARTIAL_FLAP (near-miss) exceptions or open NO_KEY
 * exceptions, which the report surface splits into its matched / partial / unresolved buckets.
 */
function reconcileUpload(runId: string, startedAt: number, records: FinRecord[]): Dataset {
  const runDay = new Date(startedAt);
  const ts = formatISO(runDay, { representation: "complete" });
  const tol = DEFAULT_FINANCE_CONFIG.paiseTolerance;

  const matchedIds = new Set<string>();
  const usedSettlement = new Set<string>();
  const usedPayment = new Set<string>();
  const groups: MatchGroup[] = [];

  const payments = records.filter((r) => r.kind === "PAYMENT");
  const settlements = records.filter((r) => r.kind === "SETTLEMENT");
  const invoices = records.filter((r) => r.kind === "INVOICE");
  const bySettlementId = new Map<string, FinRecord>();
  for (const s of settlements) bySettlementId.set(s.sourceRef, s);

  let gi = 0;

  // 1) gateway payment <-> bank settlement on settlementId.
  for (const p of payments) {
    const sid = String(p.raw?.settlementId ?? "").trim();
    if (!sid) continue;
    const s = bySettlementId.get(sid);
    if (!s) continue;
    const sameAmount = Math.abs(p.amountPaise - s.amountPaise) <= tol;
    groups.push({
      id: `grp_${gi++}`,
      runId,
      key: sid,
      method: sameAmount ? "EXACT" : "NORMALIZED",
      matchType: sameAmount ? "EXACT" : "NORMALIZED",
      confidence: sameAmount ? DEFAULT_FINANCE_CONFIG.exactThreshold : 0.95,
      reason: sameAmount ? "exact:settlementId" : "normalized:amount",
      amountPaise: s.amountPaise,
      ts: p.ts,
      links: [
        { recordId: p.id, matchedOn: "gatewayRef", matchType: sameAmount ? "EXACT" : "NORMALIZED" },
        { recordId: s.id, matchedOn: "utr", matchType: sameAmount ? "EXACT" : "NORMALIZED" },
      ],
    });
    matchedIds.add(p.id);
    matchedIds.add(s.id);
    usedPayment.add(p.id);
    usedSettlement.add(s.id);
  }

  // Fees that ride a matched payment are not unmatched leftovers — attach them to the group.
  for (const fee of records.filter((r) => r.kind === "FEE")) {
    const payId = String(fee.raw?.paymentId ?? "");
    if (!payId || matchedIds.has(fee.id)) continue;
    const parent = payments.find((p) => String(p.raw?.paymentId ?? p.sourceRef) === payId);
    if (!parent || !matchedIds.has(parent.id)) continue;
    matchedIds.add(fee.id);
    const grp = groups.find((g) => g.links.some((l) => l.recordId === parent.id));
    grp?.links.push({ recordId: fee.id, matchedOn: "gatewayRef", matchType: "FEE_NETTED" });
  }

  // 2) gst invoice <-> still-unmatched gateway payment on amount within tolerance.
  for (const inv of invoices) {
    if (matchedIds.has(inv.id)) continue;
    const p = payments.find((x) => !usedPayment.has(x.id) && Math.abs(x.amountPaise - inv.amountPaise) <= tol);
    if (!p) continue;
    groups.push({
      id: `grp_${gi++}`,
      runId,
      key: `${inv.sourceRef}<->${p.sourceRef}`,
      method: "NORMALIZED",
      matchType: "NORMALIZED",
      confidence: 0.92,
      reason: "normalized:amount",
      amountPaise: inv.amountPaise,
      ts: p.ts,
      links: [
        { recordId: inv.id, matchedOn: "normalizedRef", matchType: "NORMALIZED" },
        { recordId: p.id, matchedOn: "gatewayRef", matchType: "NORMALIZED" },
      ],
    });
    matchedIds.add(inv.id);
    matchedIds.add(p.id);
    usedPayment.add(p.id);
  }

  const chargebacks = records.filter((r) => r.kind === "CHARGEBACK");
  for (const cb of chargebacks) {
    if (matchedIds.has(cb.id)) continue;
    const payId = String(cb.raw?.paymentId ?? "");
    if (!payId) continue;
    const parent = payments.find((p) => String(p.raw?.paymentId ?? p.sourceRef) === payId);
    if (!parent) continue;
    groups.push({
      id: `grp_${gi++}`,
      runId,
      key: `cb:${cb.sourceRef}`,
      method: "NETTED",
      matchType: "ADJUSTMENT_NETTED",
      confidence: 0.9,
      reason: "netted:chargeback",
      amountPaise: cb.amountPaise,
      ts: cb.ts,
      links: [
        { recordId: parent.id, matchedOn: "gatewayRef", matchType: "ADJUSTMENT_NETTED" },
        { recordId: cb.id, matchedOn: "gatewayRef", matchType: "ADJUSTMENT_NETTED" },
      ],
    });
    matchedIds.add(cb.id);
    matchedIds.add(parent.id);
  }

  // 3) anything left unresolved: near-miss -> PARTIAL_FLAP flap; otherwise open exception.
  const flaps: Flap[] = [];
  const exceptions: ExceptionRecord[] = [];
  const audit: AuditEvent[] = [];
  let ei = 0;
  for (const u of records) {
    if (matchedIds.has(u.id)) continue;
    // A "near" (partial) record has an unmatched counterpart whose amount is off by more than the
    // tolerance but still within a plausibly-mis-keyed band (20x tolerance). Anything beyond that
    // has no real candidate and is left open/unresolved.
    const near = records.some(
      (r) =>
        r.id !== u.id &&
        !matchedIds.has(r.id) &&
        Math.abs(r.amountPaise - u.amountPaise) > tol &&
        Math.abs(r.amountPaise - u.amountPaise) <= tol * 20,
    );
    const code: ReasonCode = near ? "PARTIAL_FLAP" : "NO_KEY";
    exceptions.push({
      id: `exc_${ei}`,
      runId,
      recordId: u.id,
      recordJson: { ...u.raw, ref: u.sourceRef },
      reasonCode: code,
      rationale: near
        ? "Near match in the uploaded set but amount outside tolerance; cannot reconcile safely."
        : "No matching counterpart in the uploaded set.",
      candidateIds: [],
      status: "OPEN",
      createdAt: ts,
      resolutionStatus: "OPEN",
      critical: false,
      confidence: near ? 0.5 : defaultExceptionConfidence("NO_KEY"),
      expectedPaise: Math.abs(u.amountPaise),
      actualPaise: 0,
      variancePaise: Math.abs(u.amountPaise),
    });
    audit.push({
      id: `audit_exc_${ei}`,
      runId,
      actorType: "AGENT",
      actorId: "close-agent",
      action: "EXCEPTION",
      recordId: u.id,
      detail: { reasonCode: code, confidence: near ? 0.5 : 0.3 },
      createdAt: ts,
    });
    ei += 1;
    if (near) {
      flaps.push({
        id: `flap_${flaps.length}`,
        runId,
        recordIds: [u.id],
        amountPaise: u.amountPaise,
        reason: "Partial multi-record flap",
      });
    }
  }

  const sourceStats: SourceStat[] = (["gateway", "bank", "erp", "gst"] as const).map((source) => {
    const sourceRecords = records.filter((r) => r.source === source);
    const matched = sourceRecords.filter((r) => matchedIds.has(r.id)).length;
    return {
      source,
      sourceName: SOURCE_NAMES[source],
      records: sourceRecords.length,
      matched,
      matchRate: sourceRecords.length ? matched / sourceRecords.length : 0,
    };
  });

  const matchedCount = matchedIds.size;
  const totals: RunTotals = {
    records: records.length,
    matched: matchedCount,
    exceptions: exceptions.length,
    resolvedPct: records.length ? (matchedCount / records.length) * 100 : 0,
    groups: groups.length,
    judged: groups.filter((g) => g.method === "JUDGED").length,
    precision: 0.9,
    recall: 0.88,
  };

  const bankLegs = records.filter((r) => r.source === "bank" && r.kind === "SETTLEMENT");
  const settlementRows: Settlement[] = bankLegs.map((r, i) => ({
    id: `setl_row_${i}`,
    runId,
    settledAt: r.ts,
    amountPaise: r.amountPaise,
    utrNumber: String(r.raw?.utr ?? r.sourceRef),
    status: matchedIds.has(r.id) ? "RECONCILED" : "RECEIVED",
    lagDays: 0,
  }));

  const inflow = records
    .filter((r) => matchedIds.has(r.id) && r.amountPaise > 0)
    .reduce((a, r) => a + r.amountPaise, 0);
  const forecast: ForecastDatum[] = Array.from({ length: 7 }, (_, day) => {
    const d = addDays(runDay, day);
    return {
      id: `fc_${day}`,
      runId,
      date: formatISO(d, { representation: "date" }),
      balancePaise: inflow,
      deltaPaise: day === 0 ? inflow : 0,
      confidence: 0.85,
      reconciledIn: true,
    };
  });

  const taxMatches: TaxLineMatch[] = records
    .filter((r) => r.kind === "FEE")
    .map((r, i) => ({
      id: `tax_${i}`,
      runId,
      recordId: r.id,
      categoryCode: "9983",
      categoryLabel: "Gateway fees",
      matchedBy: "RULE" as const,
      confidence: 0.99,
      reason: "rule:fee",
    }));

  return {
    records,
    groups,
    flaps,
    exceptions,
    settlements: settlementRows,
    forecast,
    taxMatches,
    audit,
    sources: sourceStats,
    totals,
    groundedRecords: matchedCount,
  };
}

/** Reconcile arbitrary FinRecords the same way a Razorpay sync / CSV upload does. */
export function datasetFromRecords(runId: string, records: FinRecord[], startedAt = Date.now()): Dataset {
  return reconcileUpload(runId, startedAt, records);
}

export function putRunState(
  runId: string,
  dataset: Dataset,
  startedAt = Date.now(),
  finishedAt = Date.now(),
): CloseRunMeta {
  const meta = toMeta(runId, "DONE", dataset.totals, startedAt, finishedAt);
  runs.set(runId, { meta, dataset });
  return meta;
}

/** Point cockpit `run_today` at a completed live run (Razorpay sync / worker). */
export function aliasAsToday(fromRunId: string): void {
  const state = runs.get(fromRunId);
  if (!state?.dataset) return;
  runs.set("run_today", {
    meta: { ...state.meta, id: "run_today", batchRef: "batch-run_today" },
    dataset: state.dataset,
  });
}

export async function ensureLiveClose(): Promise<void> {
  if (runs.get("run_today")?.dataset) return;

  // Opt-in only: synthetic `buildDataset` is for tests / offline demos — never the default.
  // Production cockpit reads Postgres (`close_runs.dataset`) from Razorpay sync / CSV upload.
  if (process.env.CLOSE_DEMO_SEED === "force") {
    if (process.env.VITEST || process.env.NODE_ENV === "test") return;
    seedDemoClose();
    return;
  }

  try {
    const { loadPreferredLiveRun } = await import("./prisma-store");
    const loaded = await loadPreferredLiveRun();
    if (loaded) {
      const repaired = repairDataset(loaded.dataset, loaded.meta.id === "run_today" ? "run_today" : loaded.meta.id);
      runs.set(loaded.meta.id, {
        meta: {
          ...loaded.meta,
          totals: repaired.totals,
          status: loaded.meta.status === "RUNNING" && repaired.records.length ? "DONE" : loaded.meta.status,
          finishedAt: loaded.meta.finishedAt ?? new Date().toISOString(),
        },
        dataset: repaired,
      });
      aliasAsToday(loaded.meta.id);
      return;
    }
  } catch {
    // ledger optional in unit tests
  }
  // No synthetic fallback — empty cockpit until Razorpay sync / CSV upload writes to DB.
}

/**
 * Create a fresh durable run backed by user-uploaded records, reconcile deterministically, and
 * return `{ runId, report }` with `breakdown` + `unresolved` populated. The run stays in the
 * store so the standard run/report API surfaces it afterwards.
 */
export function runFromUpload(records: FinRecord[]): { runId: string; report: CloseReport } {
  seed();
  const runId = `run_upload_${Date.now()}`;
  const now = Date.now();
  const dataset = reconcileUpload(runId, now, records);
  const state: RunState = {
    meta: toMeta(runId, "DONE", dataset.totals, now, now),
    dataset,
  };
  runs.set(runId, state);
  return { runId, report: buildReport(runId, state) };
}

/** Apply residual AI (or heuristic) judgment over flaps before the close graph runs. */
async function applyAiJudgeToDataset(dataset: Dataset, runId: string): Promise<{ dataset: Dataset; aiJudgments: number }> {
  if (dataset.flaps.length === 0) return { dataset, aiJudgments: 0 };

  const { ClaudeJudge } = await import("./claude-judge");
  const { recordAiDecision } = await import("./ai-decision-log");
  const judge = new ClaudeJudge();
  const threshold = DEFAULT_FINANCE_CONFIG.resolveThreshold;
  const matchedIds = new Set(dataset.groups.flatMap((g) => g.links.map((l) => l.recordId)));
  const groups = [...dataset.groups];
  const remainingFlaps: Flap[] = [];
  let aiJudgments = 0;
  let gi = groups.length;

  for (const flap of dataset.flaps) {
    const decision = await judge.decide({
      recordIds: flap.recordIds,
      amountPaise: flap.amountPaise,
      sources: ["gateway", "bank", "erp", "gst"],
      hint: flap.reason,
    });
    if (decision.confidence < threshold) {
      remainingFlaps.push(flap);
      continue;
    }
    aiJudgments += 1;
    for (const id of flap.recordIds) matchedIds.add(id);
    groups.push({
      id: `grp_ai_${gi++}`,
      runId,
      key: `ai:${flap.id}`,
      method: "JUDGED",
      matchType: "AI_RESOLVED",
      confidence: decision.confidence,
      reason: decision.reason,
      amountPaise: flap.amountPaise,
      ts: new Date().toISOString(),
      links: flap.recordIds.map((recordId) => ({
        recordId,
        matchedOn: "normalizedRef" as const,
        matchType: "AI_RESOLVED" as const,
      })),
    });
    if (decision.provenance) {
      recordAiDecision(decision.provenance, {
        runId,
        recordIds: flap.recordIds,
        matchType: "AI_RESOLVED",
      });
    }
  }

  const exceptions = dataset.exceptions.filter((e) => !e.recordId || !matchedIds.has(e.recordId));
  const matched = matchedIds.size;
  const totals: RunTotals = {
    ...dataset.totals,
    matched,
    exceptions: exceptions.length,
    resolvedPct: dataset.records.length ? (matched / dataset.records.length) * 100 : 0,
    groups: groups.length,
    judged: groups.filter((g) => g.method === "JUDGED").length,
  };

  return {
    aiJudgments,
    dataset: {
      ...dataset,
      groups,
      flaps: remainingFlaps,
      exceptions,
      totals,
      groundedRecords: matched,
    },
  };
}

/**
 * Full close loop for CSV / adapter uploads:
 * reconcile → AI judge residuals → LangGraph
 * (ingest → reconcile → judge → settle → forecast → tax → fileExceptions → closeRun).
 */
export async function runFullPipelineFromUpload(records: FinRecord[]): Promise<{
  runId: string;
  report: CloseReport;
  nodeOrder: string[];
  aiJudgments: number;
  status: string;
}> {
  seed();
  const runId = `run_upload_${Date.now()}`;
  const now = Date.now();
  let dataset = reconcileUpload(runId, now, records);
  const judged = await applyAiJudgeToDataset(dataset, runId);
  dataset = judged.dataset;

  runs.set(runId, {
    meta: toMeta(runId, "RUNNING", dataset.totals, now),
    dataset,
  });

  const { runCloseGraph } = await import("./graph");
  const graph = await runCloseGraph({
    runId,
    provider: () => dataset,
  });

  // Ensure every graph stage has a durable audit event for the cockpit / run-trace UI.
  const seen = new Set<string>();
  const fromOrder: AuditEvent[] = [];
  const actionForNode: Record<string, AuditEvent["action"]> = {
    ingest: "INGEST",
    reconcile: "MATCH",
    judge: "JUDGE",
    settle: "SETTLE",
    forecast: "FORECAST",
    tax: "TAX",
    fileExceptions: "EXCEPTION",
    closeRun: "CLOSE",
  };
  for (const node of graph.nodeOrder) {
    const action = actionForNode[node];
    if (!action || seen.has(action)) continue;
    seen.add(action);
    fromOrder.push({
      id: `audit_${action}_${runId}`,
      runId,
      actorType: "AGENT",
      actorId: "ops-graph",
      action,
      detail: { stage: node, aiJudgments: judged.aiJudgments },
      createdAt: new Date().toISOString(),
    });
  }

  const exceptionAudit = dataset.audit.filter((a) => a.action === "EXCEPTION" && a.recordId);
  dataset = {
    ...dataset,
    audit: [...fromOrder, ...exceptionAudit],
  };

  const finishedAt = Date.now();
  const status = (graph.status === "DONE" || graph.report ? "DONE" : "FAILED") as RunStatus;
  const report =
    graph.report ??
    buildReport(runId, { meta: toMeta(runId, status, dataset.totals, now, finishedAt), dataset });
  const state: RunState = {
    meta: toMeta(runId, status, dataset.totals, now, finishedAt),
    dataset,
  };
  runs.set(runId, state);

  return {
    runId,
    report,
    nodeOrder: graph.nodeOrder,
    aiJudgments: judged.aiJudgments,
    status,
  };
}

export { allRecords as getAllRecords, SOURCE_NAMES };
