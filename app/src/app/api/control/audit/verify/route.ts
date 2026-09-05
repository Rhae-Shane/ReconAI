import { NextResponse } from "next/server";

import { type ChainLink, verifyChain } from "controller-harness/control/audit-chain";

import { denied, requireRole } from "@/lib/authz";

export const runtime = "nodejs";

/**
 * POST /api/control/audit/verify
 *
 * Verify the tamper-evident audit chain for a run. Accepts an ordered array of
 * `ChainLink` objects (the output the harness `AuditChain` produces) and returns
 * whether the chain is intact plus the first broken index, if any. This is the
 * "Verify Audit Integrity" button.
 */
export async function POST(request: Request) {
  // Read-only integrity verification (no state change) — every authenticated role may run it.
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  let links: unknown;
  try {
    const body = await request.json();
    links = body.links;
  } catch {
    return NextResponse.json({ error: "Missing links payload." }, { status: 400 });
  }
  if (!Array.isArray(links)) {
    return NextResponse.json({ error: "links must be an array of ChainLink." }, { status: 400 });
  }

  // Verify strictness over form: pass the raw array straight to verifyChain so a
  // malformed link trips the integrity check rather than throwing.
  const result = verifyChain(links as ChainLink[]);
  return NextResponse.json(result);
}
