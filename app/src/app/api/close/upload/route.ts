import { NextResponse } from "next/server";

import { adapterFor, rowErrorSummary, toFinRecords } from "@/lib/adapters";
import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { parseBankStatement } from "@/lib/close/bank-parse";
import { parseCsvUpload } from "@/lib/close/csv";
import { applyColumnMapping, type ColumnMapping } from "@/lib/close/csv-map";
import { needsSharding, SHARD_SIZE, shardRecords } from "@/lib/close/shard";
import { persistCloseArtifacts, runFromUpload } from "@/lib/close/store";
import { parsedRowsToGst2b } from "@/lib/finance/gst-books";
import { saveGstr2b } from "@/lib/finance/gst-store";
import { getRatelimit } from "@/lib/ops/ratelimit";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function classifyFilename(name: string): "payments" | "settlements" | "invoices" | "bank" | null {
  const lower = name.toLowerCase();
  if (lower.includes("payment")) return "payments";
  if (lower.includes("mt940") || lower.includes("camt") || lower.includes("bank") || lower.endsWith(".sta")) {
    return "bank";
  }
  if (lower.includes("settlement")) return "settlements";
  if (lower.includes("invoice") || lower.includes("gstr") || lower.includes("2b")) return "invoices";
  return null;
}

function looksLikeCsv(text: string): boolean {
  return text.includes(",") || text.includes("\n") || text.includes("\r");
}

function tryJsonBody(raw: string): {
  source?: string;
  text?: string;
  mapping?: ColumnMapping;
  ingest?: boolean;
} | null {
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object") return null;
    return {
      source: typeof body.source === "string" ? body.source.trim() : undefined,
      text: typeof body.text === "string" ? body.text : undefined,
      mapping: body.mapping && typeof body.mapping === "object" ? (body.mapping as ColumnMapping) : undefined,
      ingest: body.ingest !== false,
    };
  } catch {
    return null;
  }
}

async function finishRun(
  records: Parameters<typeof runFromUpload>[0],
  actor: string,
  extra: Record<string, unknown> = {},
) {
  const shards = shardRecords(records);
  const { runId, report } = runFromUpload(records);
  await persistCloseArtifacts(runId, report);
  await recordAudit({
    actor,
    role: actor,
    action: "upload:run",
    target: runId,
    detail: `${records.length} records`,
  });
  return NextResponse.json(
    {
      runId,
      report,
      shards: shards.length,
      shardSize: SHARD_SIZE,
      sharded: needsSharding(records.length),
      ...extra,
    },
    { status: 201 },
  );
}

export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const ratelimit = getRatelimit();
  if (ratelimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }
  }

  const contentType = request.headers.get("content-type") ?? "";

  let adapterRequest: { source: string; text: string; ingest: boolean } | null = null;
  let mapping: ColumnMapping | null = null;
  let mappedText = "";
  let payments = "";
  let settlements = "";
  let invoices = "";
  let bank = "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    let sourceField = "";
    let ingest = true;
    let totalBytes = 0;
    const files: { tag: string; text: string }[] = [];
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") {
        if (key === "source") sourceField = value.trim();
        if (key === "ingest") ingest = value !== "false";
        if (key === "mapping") {
          try {
            mapping = JSON.parse(value) as ColumnMapping;
          } catch {
            mapping = null;
          }
        }
        continue;
      }
      totalBytes += value.size;
      if (totalBytes > MAX_BODY_BYTES) {
        return NextResponse.json({ error: "payload too large" }, { status: 413 });
      }
      const text = await value.text();
      const tag = classifyFilename(key) ?? classifyFilename(value.name ?? "") ?? "";
      files.push({ tag, text });
    }

    if (sourceField) {
      adapterRequest = { source: sourceField, text: files[0]?.text ?? "", ingest };
    } else if (mapping) {
      mappedText = files[0]?.text ?? "";
    } else {
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
    const json = tryJsonBody(raw);
    if (json?.source && json.text) {
      adapterRequest = { source: json.source, text: json.text, ingest: json.ingest !== false };
    } else if (json?.mapping && json.text) {
      mapping = json.mapping;
      mappedText = json.text;
    } else if (!looksLikeCsv(raw)) {
      return NextResponse.json(
        { error: "Uploaded body does not look like CSV (no comma or line break found)." },
        { status: 400 },
      );
    } else {
      payments = raw;
    }
  }

  if (adapterRequest) {
    const rowAdapter = adapterFor(adapterRequest.source);
    if (!rowAdapter) {
      return NextResponse.json({ error: `Unknown source adapter "${adapterRequest.source}".` }, { status: 400 });
    }
    const result = rowAdapter.parse(adapterRequest.text);
    const records = toFinRecords(result, rowAdapter.label);
    if (adapterRequest.source.toLowerCase() === "gst2b") {
      await saveGstr2b({
        pulledAt: new Date().toISOString(),
        source: "upload",
        rows: parsedRowsToGst2b(result.rows),
      });
    }
    if (adapterRequest.ingest && records.length > 0) {
      return finishRun(records, verdict.role, {
        source: result.source,
        accepted: result.rows.length,
        errors: result.errors,
        errorReport: rowErrorSummary(result),
      });
    }
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

  if (mapping && mappedText) {
    const records = applyColumnMapping(mappedText, mapping);
    if (records.length === 0) {
      return NextResponse.json({ error: "Column map produced no records." }, { status: 400 });
    }
    return finishRun(records, verdict.role, { mapped: true });
  }

  const records = [
    ...parseCsvUpload(payments, settlements, invoices),
    ...(bank ? parseBankStatement(bank) : []),
    ...(settlements && /:61:|<Ntry[\s>]/i.test(settlements) ? parseBankStatement(settlements) : []),
  ];
  if (records.length === 0) {
    return NextResponse.json({ error: "No payable records parsed from the uploaded CSV(s)." }, { status: 400 });
  }

  return finishRun(records, verdict.role);
}
