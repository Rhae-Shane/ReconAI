import ExcelJS from "exceljs";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

import { formatPaise } from "@/lib/close/config";
import type { CloseReport, ExceptionRecord, SourceStat, UnresolvedLine } from "@/lib/close/types";

import { type EvidenceRef, listEvidenceRefs } from "./evidence";
import { loadSignOff, type SignOff } from "./signoff";

/**
 * Close Dossier assembly + serialization (Workstream A - export).
 *
 * A complete, audit-ready snapshot of a close run: headline totals, per-source match
 * rates, the unresolved residual, the honest exception list and any attached evidence
 * references, plus the (optional) sign-off. Everything here is deterministic and makes
 * no network calls beyond the no-op-safe Redis helpers, so it can be materialised and
 * serialized to XLSX / CSV / PDF for export.
 */

export interface CloseDossier {
  runId: string;
  status: string;
  generatedAt: string;
  startedAt: string;
  finishedAt?: string;
  totals: {
    records: number;
    matched: number;
    partial: number;
    unresolved: number;
    resolvedPct: number;
    exceptions: number;
  };
  perSource: SourceStat[];
  unresolvedRows: UnresolvedLine[];
  exceptions: ExceptionRecord[];
  evidence: EvidenceRef[];
  signOff?: SignOff | null;
}

/** Loose input contract for `buildDossier` - callers may pass whatever run data they have on hand. */
export interface DossierRunData {
  meta?: {
    id?: string;
    status?: string;
    startedAt?: string;
    finishedAt?: string;
    totals?: { records?: number; matched?: number; exceptions?: number; resolvedPct?: number };
  } | null;
  report?: CloseReport | null;
  dataset?: { exceptions?: ExceptionRecord[]; sources?: SourceStat[] } | null;
}

const PAISE = (p: number | undefined) => (typeof p === "number" && Number.isFinite(p) ? p : 0);

/**
 * Assemble a `CloseDossier` from the run report + any persisted evidence + the sign-off.
 * Deterministic: same inputs   →   same totals and row content (only `generatedAt` varies).
 */
export async function buildDossier(runData: DossierRunData = {}): Promise<CloseDossier> {
  const { meta, report } = runData;
  const dataset = runData.dataset ?? {};

  const runId = meta?.id ?? report?.runId ?? "unknown";
  const exceptions = report?.exceptions ?? dataset.exceptions ?? [];
  const perSource = report?.perSource ?? dataset.sources ?? [];
  const unresolvedRows = report?.unresolved ?? [];

  // Gather persisted evidence across every exception in scope, de-duplicated by ref id.
  const evidence: EvidenceRef[] = [];
  const seen = new Set<string>();
  for (const exc of exceptions) {
    for (const ref of await listEvidenceRefs(exc.id)) {
      if (seen.has(ref.id)) continue;
      seen.add(ref.id);
      evidence.push(ref);
    }
  }

  const breakdown = report?.breakdown;
  const signOff = await loadSignOff(runId);

  return {
    runId,
    status: meta?.status ?? (report ? "DONE" : "UNKNOWN"),
    generatedAt: new Date().toISOString(),
    startedAt: meta?.startedAt ?? report?.generatedAt ?? "",
    finishedAt: meta?.finishedAt,
    totals: {
      records: report?.totals?.records ?? meta?.totals?.records ?? perSource.reduce((a, s) => a + s.records, 0),
      matched: report?.totals?.matched ?? meta?.totals?.matched ?? breakdown?.matched ?? 0,
      partial: breakdown?.partial ?? 0,
      unresolved: unresolvedRows.length,
      resolvedPct: report?.totals?.resolvedPct ?? breakdown?.matchRate ?? 0,
      exceptions: exceptions.length,
    },
    perSource,
    unresolvedRows,
    exceptions,
    evidence,
    signOff,
  };
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

const csvCell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** A simple, spreadsheet-friendly CSV of the summary + unresolved and exception rows. */
export function dossierToCsv(dossier: CloseDossier): string {
  const rows: string[] = [];
  rows.push("section,key,value");
  rows.push(`dossier,runId,${csvCell(dossier.runId)}`);
  rows.push(`dossier,status,${csvCell(dossier.status)}`);
  rows.push(`dossier,generatedAt,${csvCell(dossier.generatedAt)}`);
  rows.push(`dossier,startedAt,${csvCell(dossier.startedAt)}`);
  rows.push(`dossier,finishedAt,${csvCell(dossier.finishedAt ?? "")}`);
  rows.push(`totals,records,${dossier.totals.records}`);
  rows.push(`totals,matched,${dossier.totals.matched}`);
  rows.push(`totals,partial,${dossier.totals.partial}`);
  rows.push(`totals,unresolved,${dossier.totals.unresolved}`);
  rows.push(`totals,resolvedPct,${dossier.totals.resolvedPct.toFixed(2)}`);
  rows.push(`totals,exceptions,${dossier.totals.exceptions}`);

  rows.push("unresolved,recordId,ref,expectedPaise,actualPaise,differencePaise,reason,confidence,status");
  for (const u of dossier.unresolvedRows) {
    rows.push(
      `unresolved,${csvCell(u.recordId)},${csvCell(u.ref)},${u.expectedPaise},${u.actualPaise},${u.differencePaise},${csvCell(u.reason)},${u.confidence},${csvCell(u.status)}`,
    );
  }

  rows.push("exception,id,reasonCode,status,recordId,expectedPaise,actualPaise,variancePaise,createdAt,rationale");
  for (const e of dossier.exceptions) {
    rows.push(
      `exception,${csvCell(e.id)},${csvCell(e.reasonCode)},${csvCell(e.status)},${csvCell(e.recordId ?? "")},${e.expectedPaise ?? ""},${e.actualPaise ?? ""},${e.variancePaise ?? ""},${csvCell(e.createdAt)},${csvCell(e.rationale)}`,
    );
  }

  return rows.join("\n");
}

/* ------------------------------------------------------------------ */
/* XLSX                                                                */
/* ------------------------------------------------------------------ */

/** Produce a multi-sheet workbook: Summary, Exceptions, Unresolved, Evidence. */
export async function dossierToXlsx(dossier: CloseDossier): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Analysis Studio ReconAI";

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 56 },
  ];
  summary.addRows([
    { field: "Run ID", value: dossier.runId },
    { field: "Status", value: dossier.status },
    { field: "Generated At", value: dossier.generatedAt },
    { field: "Started At", value: dossier.startedAt },
    { field: "Finished At", value: dossier.finishedAt ?? "" },
    { field: "Records", value: dossier.totals.records },
    { field: "Matched", value: dossier.totals.matched },
    { field: "Partial", value: dossier.totals.partial },
    { field: "Unresolved", value: dossier.totals.unresolved },
    { field: "Resolved %", value: Number(dossier.totals.resolvedPct.toFixed(2)) },
    { field: "Exceptions", value: dossier.totals.exceptions },
    {
      field: "Sign-off",
      value: dossier.signOff
        ? `${dossier.signOff.by} (${dossier.signOff.role}) @ ${dossier.signOff.at}`
        : "Not signed off",
    },
  ]);
  summary.getRow(1).font = { bold: true };
  for (const s of dossier.perSource)
    summary.addRow({
      field: `Matched ${s.sourceName}`,
      value: `${s.matched}/${s.records} (${(s.matchRate * 100).toFixed(1)}%)`,
    });

  const exceptions = wb.addWorksheet("Exceptions");
  exceptions.columns = [
    { header: "ID", key: "id", width: 14 },
    { header: "Reason", key: "reasonCode", width: 16 },
    { header: "Status", key: "status", width: 12 },
    { header: "Record", key: "recordId", width: 16 },
    { header: "Expected (₹)", key: "expectedPaise", width: 14 },
    { header: "Actual (₹)", key: "actualPaise", width: 14 },
    { header: "Variance (₹)", key: "variancePaise", width: 14 },
    { header: "Created At", key: "createdAt", width: 24 },
    { header: "Rationale", key: "rationale", width: 80 },
  ];
  exceptions.getRow(1).font = { bold: true };
  for (const e of dossier.exceptions) {
    exceptions.addRow({
      id: e.id,
      reasonCode: e.reasonCode,
      status: e.status,
      recordId: e.recordId ?? "",
      expectedPaise: PAISE(e.expectedPaise) / 100,
      actualPaise: PAISE(e.actualPaise) / 100,
      variancePaise: PAISE(e.variancePaise) / 100,
      createdAt: e.createdAt,
      rationale: e.rationale,
    });
  }

  const unresolved = wb.addWorksheet("Unresolved");
  unresolved.columns = [
    { header: "Ref", key: "ref", width: 16 },
    { header: "Expected (₹)", key: "expectedPaise", width: 14 },
    { header: "Actual (₹)", key: "actualPaise", width: 14 },
    { header: "Difference (₹)", key: "differencePaise", width: 14 },
    { header: "Reason", key: "reason", width: 16 },
    { header: "Confidence", key: "confidence", width: 12 },
    { header: "Status", key: "status", width: 14 },
  ];
  unresolved.getRow(1).font = { bold: true };
  for (const u of dossier.unresolvedRows) {
    unresolved.addRow({
      ref: u.ref,
      expectedPaise: u.expectedPaise / 100,
      actualPaise: u.actualPaise / 100,
      differencePaise: u.differencePaise / 100,
      reason: u.reason,
      confidence: Number(u.confidence.toFixed(2)),
      status: u.status,
    });
  }

  const evidence = wb.addWorksheet("Evidence");
  evidence.columns = [
    { header: "ID", key: "id", width: 14 },
    { header: "Exception", key: "exceptionId", width: 14 },
    { header: "Label", key: "label", width: 24 },
    { header: "Ref", key: "ref", width: 48 },
    { header: "Note", key: "note", width: 40 },
    { header: "Created At", key: "createdAt", width: 24 },
  ];
  evidence.getRow(1).font = { bold: true };
  for (const r of dossier.evidence) {
    evidence.addRow({
      id: r.id,
      exceptionId: r.exceptionId,
      label: r.label,
      ref: r.ref,
      note: r.note ?? "",
      createdAt: r.createdAt,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  // exceljs ships its own `Buffer extends ArrayBuffer`; normalise to a Node Buffer.
  return Buffer.from(buffer as unknown as ArrayBuffer);
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

/** Produce a clean, readable A4 dossier: title page + summary + open exceptions. */
export async function dossierToPdf(dossier: CloseDossier): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.15, 0.16, 0.19);
  const muted = rgb(0.45, 0.47, 0.51);
  const A4: [number, number] = [595.28, 841.89];
  const [, height] = A4;
  const margin = 56;
  const lineGap = 20;

  let page = doc.addPage(A4);
  let y = height - margin;
  const newPage = () => {
    page = doc.addPage(A4);
    y = height - margin;
  };
  const ensure = (needed: number) => {
    if (y - needed < margin) newPage();
  };

  // ---- Title page ----
  y = height - 220;
  page.drawText("CLOSE DOSSIER", { x: margin, y, size: 30, font: bold, color: ink });
  y -= 40;
  page.drawText(`Run ${dossier.runId}`, { x: margin, y, size: 18, font: reg, color: ink });
  y -= 52;
  y = height - 220 - 92;
  page.drawText(`Generated ${formatIso(dossier.generatedAt)}`, { x: margin, y, size: 11, font: reg, color: muted });
  y -= 22;
  page.drawText(`Status: ${dossier.status}`, { x: margin, y, size: 11, font: reg, color: muted });
  y -= 22;
  page.drawText(
    `Sign-off: ${dossier.signOff ? `Signed by ${dossier.signOff.by} (${dossier.signOff.role}) @ ${kDate(dossier.signOff.at)}` : "Not signed off"}`,
    { x: margin, y, size: 11, font: reg, color: muted },
  );

  // ---- Summary page ----
  newPage();
  page.drawText(`Run ${dossier.runId} — Summary`, { x: margin, y, size: 16, font: bold, color: ink });
  y -= 30;
  const summaryRows: Array<[string, string]> = [
    ["Status", dossier.status],
    ["Records", String(dossier.totals.records)],
    ["Matched", String(dossier.totals.matched)],
    ["Partial", String(dossier.totals.partial)],
    ["Unresolved", String(dossier.totals.unresolved)],
    ["Resolved %", `${dossier.totals.resolvedPct.toFixed(2)}%`],
    ["Exceptions", String(dossier.totals.exceptions)],
  ];
  for (const [k, v] of summaryRows) {
    ensure(lineGap);
    page.drawText(k, { x: margin, y, size: 11, font: reg, color: muted });
    page.drawText(v, { x: margin + 200, y, size: 11, font: bold, color: ink });
    y -= lineGap;
  }
  y -= 8;
  if (dossier.perSource.length > 0) {
    page.drawText("Per-source match rates", { x: margin, y, size: 12, font: bold, color: ink });
    y -= lineGap;
    for (const s of dossier.perSource) {
      ensure(lineGap);
      page.drawText(s.sourceName, { x: margin, y, size: 11, font: reg, color: muted });
      page.drawText(`${s.matched}/${s.records} (${(s.matchRate * 100).toFixed(1)}%)`, {
        x: margin + 200,
        y,
        size: 11,
        font: reg,
        color: ink,
      });
      y -= lineGap;
    }
  }

  // ---- Open exceptions ----
  newPage();
  page.drawText(`Open Exceptions (${dossier.exceptions.length})`, { x: margin, y, size: 16, font: bold, color: ink });
  y -= 30;
  if (dossier.exceptions.length === 0) {
    page.drawText("No exceptions on record for this close.", { x: margin, y, size: 11, font: reg, color: muted });
  } else {
    for (const e of dossier.exceptions) {
      ensure(64);
      page.drawText(`${e.id} · ${e.reasonCode} · ${e.status}`, { x: margin, y, size: 11, font: bold, color: ink });
      y -= 18;
      const paise = PAISE(e.expectedPaise);
      page.drawText(paise ? formatPaise(paise) : "amount n/a", { x: margin, y, size: 11, font: reg, color: muted });
      y -= 18;
      page.drawText(withEllipsis(e.rationale, 96), { x: margin, y, size: 10, font: reg, color: muted });
      y -= 26;
    }
  }

  // ---- Evidence (compact) ----
  if (dossier.evidence.length > 0) {
    newPage();
    page.drawText(`Evidence References (${dossier.evidence.length})`, {
      x: margin,
      y,
      size: 16,
      font: bold,
      color: ink,
    });
    y -= 30;
    for (const r of dossier.evidence) {
      ensure(40);
      page.drawText(`${r.label} — ${r.ref}`, { x: margin, y, size: 10, font: reg, color: ink });
      y -= 20;
    }
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

function formatIso(iso: string): string {
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

function kDate(iso: string): string {
  try {
    return new Date(iso).toString();
  } catch {
    return iso;
  }
}

function withEllipsis(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
