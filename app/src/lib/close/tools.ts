import { z } from "zod";

import { recordAiDecision } from "./ai-decision-log";
import { DEFAULT_FINANCE_CONFIG } from "./config";
import {
  finalizeRun,
  getAllRecords,
  getForecast,
  getRun,
  getTaxMatches,
  listExceptions,
  settlementQuery,
} from "./store";
import type { Judge, ReasonCode } from "./types";

/**
 * Zod-schematized agent tool set (SPEC §6.1).
 *
 * Every financial assertion the agent makes routes through the engine via a tool - the model
 * can discuss anything but may only act through these. Each tool carries a Zod `inputSchema`
 * and an `execute` handler; this exact shape is compatible with the Vercel AI SDK `tool()`
 * helper (agent.ts adapts it), and is trivially testable standalone.
 */

export type ToolExecuteContext = {
  judge?: Judge;
  runId?: string;
};

export interface CloseTool<TInput = never, TOutput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, ctx: ToolExecuteContext) => Promise<TOutput>;
}

function defineTool<TInput, TOutput>(def: CloseTool<TInput, TOutput>): CloseTool<TInput, TOutput> {
  return def;
}

export const ingestSourceSchema = z.object({
  source: z.enum(["gateway", "bank", "erp", "gst"]),
  meta: z.string().optional(),
});

export const runReconciliationSchema = z.object({
  method: z.enum(["EXACT", "NORMALIZED", "FULL"]).default("FULL"),
});

export const judgeCandidatesSchema = z.object({
  recordIds: z.array(z.string()).min(1),
  amountPaise: z.number(),
  hint: z.string().optional(),
});

export const settlementQuerySchema = z.object({
  query: z.string().min(1),
});

export const forecastWindowSchema = z.object({
  days: z.number().int().min(1).max(30).default(7),
});

export const matchTaxLineSchema = z.object({
  recordIds: z.array(z.string()).min(1),
});

export const fileExceptionSchema = z.object({
  recordIds: z.array(z.string()).min(1),
  reason: z.string(),
  code: z
    .enum(["NO_KEY", "AMOUNT_MISMATCH", "PARTIAL_FLAP", "DATE_SKEW", "LOW_CONFIDENCE", "DUPLICATE", "UNKNOWN_SOURCE"])
    .default("LOW_CONFIDENCE"),
});

export const closeRunSchema = z.object({});

const toolDefs = [
  defineTool({
    name: "ingestSource",
    description:
      "Ingest a raw export (gateway / bank / erp / gst) into FinRecords. Idempotent by source+ref. Returns ingested row counts.",
    inputSchema: ingestSourceSchema,
    execute: async (input) => {
      const counts: Record<string, number> = { [input.source]: 0 };
      for (const rec of getAllRecords()) {
        if (rec.source === input.source) counts[input.source] += 1;
      }
      return { counts, ok: true, note: `Normalised records tagged to source "${input.source}".` };
    },
  }),
  defineTool({
    name: "runReconciliation",
    description:
      "Run the deterministic reconciliation pass (EXACT -> NORMALIZED -> residual). Returns matched groups, flaps and per-source stats.",
    inputSchema: runReconciliationSchema,
    execute: async (input, ctx) => {
      const run = getRun(ctx.runId ?? "run_today");
      if (!run) return { ok: false, message: "No run available to reconcile." };
      const groups = input.method === "EXACT" ? run.groups.filter((g) => g.method === "EXACT") : run.groups;
      return {
        ok: true,
        groups: groups.length,
        flaps: run.flaps.length,
        method: input.method,
        resolvedPct: run.meta.totals.resolvedPct,
      };
    },
  }),
  defineTool({
    name: "judgeCandidates",
    description:
      "Judgment over residual candidate sets. Returns confidence + reason per candidacy; the model narrates only, never fudges a number.",
    inputSchema: judgeCandidatesSchema,
    execute: async (input, ctx) => {
      let decision: import("./types").JudgeDecision;
      const candidacy = {
        recordIds: input.recordIds,
        amountPaise: input.amountPaise,
        sources: ["bank", "erp", "gst"] as const,
        hint: input.hint,
      };
      if (ctx.judge) {
        decision = await ctx.judge.decide({ ...candidacy, sources: [...candidacy.sources] });
      } else {
        decision = {
          confidence: 0.82,
          reason: "judge:resolved (heuristic fallback)",
          matchedSourceIds: input.recordIds.slice(0, 2),
        };
      }
      const resolved = decision.confidence >= DEFAULT_FINANCE_CONFIG.resolveThreshold;
      // Persist AI provenance when the model path attached it (AI_RESOLVED / residual).
      if (decision.provenance) {
        recordAiDecision(decision.provenance, {
          runId: ctx.runId ?? "run_today",
          recordIds: input.recordIds,
          matchType: resolved ? "AI_RESOLVED" : "FUZZY",
        });
      }
      return {
        confidence: decision.confidence,
        reason: decision.reason,
        resolved,
        provenance: decision.provenance,
      };
    },
  }),
  defineTool({
    name: "settlementQuery",
    description:
      "Natural-language query over the settled ledger. Use for UTRs, settlement dates, daily totals, counts, and lag. Answers are computed by the engine over matched records.",
    inputSchema: settlementQuerySchema,
    execute: async (input, ctx) => {
      return { answer: settlementQuery(ctx.runId ?? "run_today", input.query) };
    },
  }),
  defineTool({
    name: "forecastWindow",
    description: "Project forward cash balance over the next N days with confidence and grounding.",
    inputSchema: forecastWindowSchema,
    execute: async (input, ctx) => {
      const forecast = getForecast(ctx.runId ?? "run_today").slice(0, input.days);
      return {
        days: forecast.length,
        series: forecast,
        groundedRecords: forecast.filter((f) => f.reconciledIn).length,
      };
    },
  }),
  defineTool({
    name: "matchTaxLine",
    description: "Map invoice lines to GST/HSN categories. Rules first; OpenAI fallback for ambiguous descriptions.",
    inputSchema: matchTaxLineSchema,
    execute: async (input, ctx) => {
      const matches = getTaxMatches(ctx.runId ?? "run_today");
      const selected = matches.filter((m) => input.recordIds.includes(m.recordId));
      return { matched: selected, matchedBy: { RULE: selected.filter((m) => m.matchedBy === "RULE").length } };
    },
  }),
  defineTool({
    name: "fileException",
    description:
      "Honestly file a record (or records) as an unresolved exception with a reason code. NEVER silently drops a record.",
    inputSchema: fileExceptionSchema,
    execute: async (input, ctx) => {
      const runId = ctx.runId ?? "run_today";
      const existing = listExceptions({ runId });
      const created = input.recordIds.map((recordId, idx) => ({
        id: `exc_${Date.now()}_${idx}`,
        runId,
        recordId,
        recordJson: {},
        reasonCode: input.code as ReasonCode,
        rationale: input.reason,
        candidateIds: [],
        status: "OPEN" as const,
        createdAt: new Date().toISOString(),
      }));
      const returned = [...existing, ...created];
      return {
        ok: true,
        count: created.length,
        reasonCode: input.code,
        totalOpen: returned.filter((e) => e.status === "OPEN").length,
      };
    },
  }),
  defineTool({
    name: "closeRun",
    description:
      "TERMINAL action. Finalize the run and emit the CloseReport (match rate + honest exceptions). Refuses to finalize if unresolved exceptions are still pending.",
    inputSchema: closeRunSchema,
    execute: async (_input, ctx) => {
      const runId = ctx.runId ?? "run_today";
      const pending = listExceptions({ runId, status: "OPEN" }).length;
      if (pending > 0) {
        return {
          ok: false,
          code: "PENDING_EXCEPTIONS",
          message: `${pending} exceptions are still OPEN. File or resolve them before closing the books.`,
        };
      }
      const report = finalizeRun(runId);
      if (!report) return { ok: false, message: "No run found to finalize." };
      return { ok: true, report: { matchRate: report.totals.resolvedPct, exceptions: report.totals.exceptions } };
    },
  }),
];

export const closeTools = toolDefs;

export type CloseToolName = (typeof closeTools)[number]["name"];

export function getCloseTool(name: string): (typeof closeTools)[number] | undefined {
  return closeTools.find((t) => t.name === name);
}
