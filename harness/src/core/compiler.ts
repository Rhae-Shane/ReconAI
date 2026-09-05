/**
 * compiler.ts — Rule compiler + simulator.
 *
 * `compileRules` turns parsed `RuleDefinition[]` into executable
 * `CompiledRule[]` (a pure `predicate(run) => boolean` gate plus a 0..1
 * `score`). `simulate` applies compiled rules to a `Batch` and reports which
 * records matched which rule — the dry-run step used *before* a rule is
 * promoted to production, so a rule can never alter ledger truth until it has
 * been observed. Pure and side-effect free.
 */
import type { Batch, FinRecord, MatchGroup } from './types.js';
import type { RuleDefinition, RuleNet, RuleTolerance } from './dsl.js';
import { buildRecord } from './ingest.js';

/** The reconciliation context a compiled rule is evaluated against. */
export interface RuleRunContext {
  runId: string;
  records: FinRecord[];
  groups?: MatchGroup[];
}

/** A compiled, promotable rule. `predicate` gates; `score` ranks. */
export interface CompiledRule {
  id: string;
  source: string;
  match: string[];
  net: RuleNet;
  tolerance: RuleTolerance;
  /** True when the run satisfies this rule's source + match gate. */
  predicate: (run: RuleRunContext) => boolean;
  /** 0..1: how well the run's records satisfy the match fields (avg presence). */
  score: (run: RuleRunContext) => number;
}

/** True when a single record carries the rule's source and all match fields. */
export function recordMatchesRule(rule: Pick<RuleDefinition, 'source' | 'match'>, rec: FinRecord): boolean {
  if (rec.source !== rule.source) return false;
  return rule.match.every((f) => present(rec, f));
}

/** Field presence ratio (0..1) for a record against a list of fields. */
export function fieldPresence(rec: FinRecord, fields: string[]): number {
  if (fields.length === 0) return rec.source ? 1 : 0;
  const hit = fields.filter((f) => present(rec, f)).length;
  return hit / fields.length;
}

/** A recognized FinRecord key is "present" when it holds a non-empty value. */
function present(rec: FinRecord, field: string): boolean {
  const v = (rec as unknown as Record<string, unknown>)[field];
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return true;
}

/** Compile parsed definitions into executable rules. */
export function compileRules(defs: RuleDefinition[]): CompiledRule[] {
  return defs.map((d) => ({
    id: d.id,
    source: d.source,
    match: [...d.match],
    net: { ...d.net },
    tolerance: { ...d.tolerance },
    predicate: (run) => {
      const inScope = run.records.filter((r) => r.source === d.source);
      if (inScope.length === 0) return false;
      return inScope.some((r) => recordMatchesRule(d, r));
    },
    score: (run) => {
      const inScope = run.records.filter((r) => r.source === d.source);
      if (inScope.length === 0) return 0;
      const total = inScope.reduce((a, r) => a + fieldPresence(r, d.match), 0);
      return total / inScope.length;
    },
  }));
}

/** One record's outcome against one rule in a simulation. */
export interface RuleSimulationRow {
  ruleId: string;
  recordId: string;
  source: string;
  matched: boolean;
  score: number;
  fieldsPresent: string[];
  fieldsMissing: string[];
}

/** Per-rule summary over a whole batch dry-run. */
export interface RuleSimulationSummary {
  ruleId: string;
  applied: boolean;
  source: string;
  matchedRecords: number;
  recordsScanned: number;
  avgScore: number;
}

/** The full dry-run report for a set of compiled rules against a batch. */
export interface RuleSimulationReport {
  runId: string;
  recordCount: number;
  rows: RuleSimulationRow[];
  summary: RuleSimulationSummary[];
}

/** Flatten a Batch's raw rows into normalized FinRecords (dedup by id). */
export function recordsFromBatch(batch: Batch): FinRecord[] {
  const out: FinRecord[] = [];
  const seen = new Set<string>();
  for (const sd of batch.sources) {
    for (const row of sd.rows) {
      const rec = buildRecord(row, sd.source);
      if (!seen.has(rec.id)) {
        seen.add(rec.id);
        out.push(rec);
      }
    }
  }
  return out;
}

/**
 * Apply compiled rules to a batch and report matches. Pure with respect to the
 * rules and records — it reads the batch, classifies, and returns a report; it
 * never writes to a ledger or posts any financial effect.
 */
export function simulate(compiled: CompiledRule[], batch: Batch): RuleSimulationReport {
  const records = recordsFromBatch(batch);
  const rows: RuleSimulationRow[] = [];
  const summary: RuleSimulationSummary[] = [];

  for (const rule of compiled) {
    let matchedRecords = 0;
    let scanned = 0;
    let scoreSum = 0;
    for (const rec of records) {
      if (rec.source !== rule.source) continue;
      scanned++;
      const present = rule.match.filter((f) => presentField(rec, f));
      const missing = rule.match.filter((f) => !presentField(rec, f));
      const matched = rule.match.length > 0 && missing.length === 0;
      const score = rule.match.length ? present.length / rule.match.length : 1;
      if (matched) matchedRecords++;
      scoreSum += score;
      rows.push({
        ruleId: rule.id,
        recordId: rec.id,
        source: rec.source,
        matched,
        score,
        fieldsPresent: present,
        fieldsMissing: missing,
      });
    }
    const applied = matchedRecords > 0;
    summary.push({
      ruleId: rule.id,
      applied,
      source: rule.source,
      matchedRecords,
      recordsScanned: scanned,
      avgScore: scanned ? scoreSum / scanned : 0,
    });
  }

  return { runId: `sim-${batch.id}`, recordCount: records.length, rows, summary };
}

function presentField(rec: FinRecord, field: string): boolean {
  return present(rec, field);
}
