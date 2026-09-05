import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { listEntities } from "@/lib/finance/entity";
import { convert, type FxRate, listFxRates, setFxRate } from "@/lib/finance/fx";

export const runtime = "nodejs";

/** GET /api/finance/fx - list legal entities and configured FX rates (reads allow viewer+). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const [entities, rates] = await Promise.all([listEntities(), listFxRates()]);
  return NextResponse.json({ entities, rates });
}

/** POST /api/finance/fx - set an FX rate (accountant/owner) or convert an amount (reader+). */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action;

  if (action === "setRate") {
    // Writing a rate mutates the FX table — write-capable roles only.
    const verdict = await requireRole(["owner", "accountant"]);
    if (!verdict.ok) return await denied(verdict);

    const rate = body.rate as Partial<FxRate> | undefined;
    const base = typeof rate?.base === "string" ? rate.base.trim().toUpperCase() : "";
    const quote = typeof rate?.quote === "string" ? rate.quote.trim().toUpperCase() : "";
    const numericRate = typeof rate?.rate === "number" && Number.isFinite(rate.rate) ? rate.rate : NaN;
    const date = typeof rate?.date === "string" ? rate.date : "";

    if (!base || !quote || base === quote || numericRate <= 0 || !date || Number.isNaN(new Date(date).getTime())) {
      return NextResponse.json(
        {
          error: "Body must include rate: { base, quote, rate (>0), date (valid ISO) } with distinct currencies.",
        },
        { status: 400 },
      );
    }

    const saved = await setFxRate({ base, quote, rate: numericRate, date });
    return NextResponse.json({ saved, rate: { base, quote, rate: numericRate, date } });
  }

  if (action === "convert") {
    // Pure arithmetic — every authenticated role may convert.
    const verdict = await requireRole(["owner", "accountant", "viewer"]);
    if (!verdict.ok) return await denied(verdict);

    const amountPaise = Number(body.amountPaise);
    const from = typeof body.from === "string" ? body.from : "";
    const to = typeof body.to === "string" ? body.to : "";
    const rate = Number(body.rate);
    if (!Number.isFinite(amountPaise) || !from || !to || !Number.isFinite(rate)) {
      return NextResponse.json(
        { error: "Body must include numeric amountPaise, non-empty from/to and a finite rate." },
        { status: 400 },
      );
    }

    return NextResponse.json({ convertedPaise: convert(amountPaise, from, to, rate) });
  }

  return NextResponse.json({ error: 'Action must be "setRate" or "convert".' }, { status: 400 });
}
