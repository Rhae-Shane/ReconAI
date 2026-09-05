import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, type ToolSet } from "ai";

import { ClaudeJudge } from "./claude-judge";
import { openaiKey } from "./openai-embeddings";
import { getRun, settlementQuery } from "./store";
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

/** Settlement Q&A only needs the ledger query tool — keeps the model from wandering. */
function toSettlementChatTools(runId: string): ToolSet {
  const t = closeTools.find((tool) => tool.name === "settlementQuery");
  if (!t) return {};
  return {
    settlementQuery: {
      description:
        "Query the settled ledger for UTRs, settlement dates, daily totals, counts, and lag. Pass the user's question (or a clear rewrite). Always call this before answering.",
      inputSchema: t.inputSchema,
      execute: (input: unknown) => t.execute(input as never, { runId }),
    },
  } as unknown as ToolSet;
}

const SETTLEMENT_CHAT_PROMPT = `You are the settlement analyst for the settled ledger.
ALWAYS call settlementQuery before answering — pass the user's question (or a clear rewrite like "list all settlement dates").
Base your reply on the tool's answer. Cite UTRs, dates, and amounts from the tool result.
Do not invent settlements. If a requested date has no rows, list the available settled dates from the tool.
Keep replies concise and factual.`;

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
  if (!run) return "[engine] No completed run to query. Start a close run first.";
  return `[engine] ${settlementQuery(runId, prompt)}`;
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
    // Default stopWhen is stepCountIs(1), which ends after the first tool call with no
    // narrated answer. Allow a short tool loop so the model can call settlementQuery,
    // then write the reply the chat UI streams.
    const result = streamText({
      model: createOpenAI({ apiKey: openaiKey() })(AGENT_MODEL),
      system: SETTLEMENT_CHAT_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: toSettlementChatTools(runId),
      stopWhen: stepCountIs(5),
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
