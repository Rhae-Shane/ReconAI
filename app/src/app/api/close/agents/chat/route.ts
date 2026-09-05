import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { streamCloseChat } from "@/lib/close/agent";
import { getRatelimit } from "@/lib/ops/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
  runId?: string;
};

/**
 * POST /api/close/agents/chat - streaming settlement Q&A (`ai` SDK).
 * Always returns a text stream (AI SDK when a key is present, deterministic engine answer
 * otherwise), so the chat UI keeps a single streaming contract.
 */
export async function POST(request: Request) {
  // Read-only settlement Q&A over the run data — every authenticated role may ask.
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const body = (await request.json().catch(() => ({}))) as Body;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "messages is required" }, { status: 400 });
  }

  // Rate-limit when a Redis backend is configured; no-op otherwise.
  const ratelimit = getRatelimit();
  if (ratelimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }
  }

  const { stream, usedFallback } = await streamCloseChat(messages, { runId: body.runId });

  const response = new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Close-Engine": usedFallback ? "fallback" : "openai",
      Connection: "keep-alive",
    },
  });

  return response;
}
