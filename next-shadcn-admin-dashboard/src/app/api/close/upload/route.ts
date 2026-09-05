import { NextResponse } from "next/server";

import { adapterFor, rowErrorSummary } from "@/lib/adapters";
import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { parseBankStatement } from "@/lib/close/bank-parse";
import { parseCsvUpload } from "@/lib/close/csv";
import { runFromUpload } from "@/lib/close/store";
import { getRatelimit } from "@/lib/ops/ratelimit";

export const runtime = "nodejs";

/** Max accepted upload body size in bytes (10 MiB). */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/** @internal classify a multipart file (by field key or filename) as payments/settlements/invoices. */
function classifyFilename(name: string): "payments" | "settlements" | "invoices" | "bank" | null {
  const lower = name.toLowerCase();
  if (lower.includes("payment")) return "payments";
  if (lower.includes("mt940") || lower.includes("camt") || lower.includes("bank") || lower.endsWith(".sta")) {
    return "bank";
  }
  if (lower.includes("settlement")) return "settlements";
  if (lower.includes("invoice")) return "invoices";
  return null;
}

/** True when a raw body looks like tabular CSV (a comma or a line break is present). */
function looksLikeCsv(text: string): boolean {
  return text.includes(",") || text.includes("\n") || text.includes("\r");
}

/** True when a JSON body carries the branded-adapter shape `{ source, text }`. */
function tryJsonAdapter(raw: string): { source: string; text: string } | null {
  try {
    const body = JSON.parse(raw) as { source?: unknown; text?: unknown } | null;
    const source = typeof body?.source === "string" ? body.source.trim() : "";
    const text = typeof body?.text === "string" ? body.text : "";
    if (source && text) return { source, text };
  } catch {
    // not JSON — caller falls back to the generic CSV path.
  }
  return null;
}

/**
 * POST /api/close/upload
 *
 * Accepts either:
 *  - a raw CSV body (single file, treated as payments.csv), or
 *  - multipart/form-data with payments.csv / settlements.csv / invoices.csv files.
 *
 * Parses uploads into normalized records, reconciles a fresh run, and returns
 * `{ runId, report }` with `report.breakdown` + `report.unresolved` populated.
 *
 * Hardened: rate-limited per client IP, capped at 10 MiB total body size (413), and
 * rejects non-CSV payloads / empty parses with a 400.
 */
export async function POST(request: Request) {
  // Uploading records creates/ingests data into a close run — write-capable roles only.
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  // Rate-limit when a Redis backend is configured; no-op otherwise (same pattern as the chat route).
  const ratelimit = getRatelimit();
  if (ratelimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }
  }

  const contentType = request.headers.get("content-type") ?? "";

  let adapterRequest: { source: string; text: string } | null = null;
  let payments = "";
  let settlements = "";
  let bank = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    let sourceField = "";
    let totalBytes = 0;
    const files: { tag: string; text: string }[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        // A `source` text field opts this upload into the branded-adapter path.
        if (key === "source") sourceField = value.trim();
        continue;
      }

      // Enforce the 10 MiB cap on the sum of file parts (and each file).
      totalBytes += value.size;
      if (totalBytes > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "payload too large" }, { status: 413 });
      }

      const text = await value.text();
      const tag = classifyFilename(key) ?? classifyFilename(value.name ?? "") ?? "";
      files.push({ tag, text });
    }

    if (sourceField) {
      // Branded path: the source field names the adapter, and the (single) file is its payload.
      // No CSV-shape gate here — an adapter may legitimately parse OFX/XML/JSON, not just CSV.
      const firstFile = files[0];
      adapterRequest = { source: sourceField, text: firstFile ? firstFile.text : "" };
    } else {
      // Preserve the original generic-CSV shape check on classified file parts.
      if (files.some((f) => !looksLikeCsv(f.text))) {
        return NextResponse.json(
          { error: "Uploaded file does not look like CSV (no comma or line break found)." },
          { status: 400 },
        );
      }
      for (const f of files) {
        if (f.tag === "settlements") settlements = f.text;
        else if (f.tag === "invoices") invoices = f.text;
        else if (f.tag === "bank") bank = f.text;
        else payments = f.text;
      }
    }
  } else {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload too large" }, { status: 413 });
    }
    // A `{ source, text }` JSON body routes through a branded adapter.
    const adapter = tryJsonAdapter(raw);
    if (adapter) {
      adapterRequest = adapter;
    } else if (!looksLikeCsv(raw)) {
      return NextResponse.json(
        { error: "Uploaded body does not look like CSV (no comma or line break found)." },
        { status: 400 },
      );
    } else {
      payments = raw;
    }
  }

  // Branded source-adapter path: validate via the adapter, report accepted rows + per-row errors.
  if (adapterRequest) {
    const rowAdapter = adapterFor(adapterRequest.source);
    if (!rowAdapter) {
      return NextResponse.json({ error: `Unknown source adapter "${adapterRequest.source}".` }, { status: 400 });
    }
    const result = rowAdapter.parse(adapterRequest.text);
    return NextResponse.json(
      {
        source: result.source,
        accepted: result.rows.length,
        rows: result.rows,
        errors: result.errors,
        errorReport: rowErrorSummary(result),
      },
      { status: 200 },
    );
  }

  const records = [
    ...parseCsvUpload(payments, settlements, invoices),
    ...(bank ? parseBankStatement(bank) : []),
    ...(settlements && /:61:|<Ntry[\s>]/i.test(settlements) ? parseBankStatement(settlements) : []),
  ];
  if (records.length === 0) {
    return NextResponse.json({ error: "No payable records parsed from the uploaded CSV(s)." }, { status: 400 });
  }

  const { runId, report } = runFromUpload(records);
  const { persistCloseArtifacts } = await import("@/lib/close/store");
  await persistCloseArtifacts(runId, report);

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "upload:run",
    target: runId,
    detail: `${records.length} records`,
  });

  return NextResponse.json({ runId, report }, { status: 201 });
}
