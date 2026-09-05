import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { listLedger, type NewLedgerEntry, postJournal, trialBalance } from "@/lib/finance/ledger";

export const runtime = "nodejs";

/** GET /api/finance/ledger?periodId=... - trial balance (account + net), viewer+. */
export async function GET(request: Request) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId") ?? undefined;
  const tb = await trialBalance(periodId);
  if (searchParams.get("entries") === "1") {
    const entries = await listLedger(periodId);
    return NextResponse.json({ ...tb, entries });
  }
  return NextResponse.json(tb);
}

/**
 * POST /api/finance/ledger - post a balancing journal batch `{ entries }`.
 * Guarded to accountant+owner. Refuses (409) when any target period is closed.
 */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const entries = Array.isArray((body as { entries?: unknown })?.entries)
    ? (body as { entries: NewLedgerEntry[] }).entries
    : null;
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "entries (non-empty array) required" }, { status: 400 });
  }

  const result = await postJournal(entries);
  return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: 409 });
}
