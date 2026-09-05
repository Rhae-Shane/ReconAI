import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type ToolSet } from "ai";

import { ClaudeJudge } from "./claude-judge";
import { getFinanceConfig } from "./config";
import { openaiKey } from "./openai-embeddings";
import { getRun, listExceptions, settlementQuery } from "./store";
import { closeTools } from "./tools";

/**
 * Agent wiring layer (Vercel AI SDK `streamText` loop) that connects the Zod-schematized tools
 * in `tools.ts` to the engine, per SPEC §6. Every tool routes through FinanceCore; the model
 * only narrates on top of engine-computed numbers.
 *
 * Deliberately resilient to a missing API key: when no key is present it falls back to a
 * deterministic responder over the settled ledger, so the settlement Q&A screen and the close
 * flow work end-to-end locally.
 */

const AGENT_MODEL = "gpt-4o-mini";
const JUDGE_MODEL = "gpt-4o-mini";

export function hasApiKey() {
  return Boolean(openaiKey());
}

function makeJudge() {
  return new ClaudeJudge({ model: JUDGE_MODEL });
}

/**
 * Adapt the schema-backed tool set into an AI SDK ToolSet (shared by getAgentTools and the
 * loop). The tools are built from our Zod `inputSchema`s and engine-bound `execute` handlers,
 * matching the SDK's `tool()` shape; cast to ToolSet at the boundary.
 */
function toAiTools(runId: string): ToolSet {
  const tools: Record<string, unknown> = {};
  for (const t of closeTools) {
    tools[t.name] = {
      description: t.description,
      inputSchema: t.inputSchema,
      execute: (input: unknown) => t.execute(input as never, { runId, judge: makeJudge() }),
    };
  }
  return tools as unknown as ToolSet;
}

export function getAgentTools() {
  return toAiTools("run_today");
}

const SYSTEM_PROMPT = `You are the finance controller. You reconcile, settle, forecast and match tax.
You never guess a match - you assign confidence and file exceptions when you are not sure.
The decisive numbers are computed by the engine, not by you. Use the provided tools to act;
discuss freely, but never assert a match or resolve an exception except via a tool.`;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Deterministic fallback answer (used when no API key is configured). Returns a plain string
 * that the route streams back chunk-by-chunk to preserve the streaming contract.
 */
function fallbackAnswer(runId: string, prompt: string): string {
  const run = getRun(runId);
  const prefix = "[engine] ";
  if (!run) return `${prefix}No completed run to query. Start a close run first.`;
  const open = listExceptions({ runId, status: "OPEN" }).length;
  const ledger = settlementQuery(runId, prompt);
  return `${prefix}${ledger} Across the latest close run, ${run.meta.totals.records} records were processed with ${run.meta.totals.resolvedPct.toFixed(
    1,
  )}% resolved (${open} exception(s) still open, threshold ${getFinanceConfig().resolveThreshold}). Ask about UTRs, settlement lag, or daily totals and I will cite matched records.`;
}

const encoder = new TextEncoder();

function stringReaderStream(chunks: string[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    start(controller) {
      const tick = () => {
        if (i < chunks.length) {
          controller.enqueue(encoder.encode(chunks[i]));
          i += 1;
          setTimeout(tick, 18);
        } else {
          controller.close();
        }
      };
      tick();
    },
  });
}

/**
 * Streaming chat response for the settlement Q&A screen. Resolves to a ReadableStream of text
 * deltas. When an OpenAI key is present it uses streamText with the full tool set; otherwise it
 * streams the deterministic engine answer.
 */
export async function streamCloseChat(
  messages: ChatMessage[],
  opts: { runId?: string } = {},
): Promise<{ stream: ReadableStream<Uint8Array>; usedFallback: boolean }> {
  const runId = opts.runId ?? "run_today";
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  if (!hasApiKey()) {
    return { stream: stringReaderStream([fallbackAnswer(runId, lastUser)]), usedFallback: true };
  }

  try {
    const result = streamText({
      model: createOpenAI({ apiKey: openaiKey() })(AGENT_MODEL),
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: toAiTools(runId),
    });
    return { stream: result.textStream.pipeThrough(encoderStream()), usedFallback: false };
  } catch {
    return { stream: stringReaderStream([fallbackAnswer(runId, lastUser)]), usedFallback: true };
  }
}

function encoderStream() {
  return new TransformStream<string, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(encoder.encode(chunk));
    },
  });
}

export { AGENT_MODEL, JUDGE_MODEL };
