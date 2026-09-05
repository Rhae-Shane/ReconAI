import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { listEvidenceRefs, saveEvidenceRef } from "@/lib/finance/evidence";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function parseBody(body: unknown): { label?: string; ref?: string; note?: string } {
  const b = (body ?? {}) as { label?: string; ref?: string; note?: string };
  return {
    label: typeof b.label === "string" ? b.label.trim() : undefined,
    ref: typeof b.ref === "string" ? b.ref.trim() : undefined,
    note: typeof b.note === "string" ? b.note.trim() : undefined,
  };
}

/**
 * GET /api/close/exceptions/:id/evidence - list attached evidence refs for an exception.
 */
export async function GET(_request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;
  return NextResponse.json({ evidence: await listEvidenceRefs(id) });
}

/**
 * POST /api/close/exceptions/:id/evidence - attach an evidence reference (url / doc-id / utr).
 * Body: { label, ref, note? }. Evidence is a reference, not an uploaded file.
 */
export async function POST(request: Request, { params }: Params) {
  // Attaching evidence changes a financial exception's record — write-capable roles only.
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;
  const body = parseBody(await request.json().catch(() => ({})));

  if (!body.label || !body.ref) {
    return NextResponse.json({ error: "label and ref are required" }, { status: 400 });
  }

  const saved = await saveEvidenceRef({ exceptionId: id, label: body.label, ref: body.ref, note: body.note });

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "exceptions:evidence",
    target: (id ?? "").toString(),
    detail: body.label,
  });

  return NextResponse.json({
    saved,
    evidence: await listEvidenceRefs(id),
  });
}
