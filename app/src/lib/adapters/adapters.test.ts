import { describe, expect, it } from "vitest";

import type { AdapterResult } from "./index";
import { adapterFor, rowErrorSummary } from "./index";

const RAZORPAY_CSV = `Settlement ID,Settle Time,UTR,Source Amount,Fee,Tax on Fee,Net Amount,Order Ref,Invoice
setl_123,2024-03-01T10:00:00Z,UTR123,1000.00,20.00,3.60,976.40,ord_1,INV-001
setl_bad,,UTR456,50.00,1.00,0.18,48.82,ord_2,INV-002
`;

const BANK_CSV = `Date,Narration,Amount,Ref
2024-03-01,Settlement payout,5000.00,UTR999
2024-03-02,Card Payment,-2435.50,ref_02
`;

const OFX = `<?xml version="1.0"?>
<OFX>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
    <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20240301120000</DTPOSTED><TRNAMT>400.25</TRNAMT><FITID>ofx_1</FITID><MEMO>Instant settlement</MEMO></STMTTRN>
    <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20240302</DTPOSTED><TRNAMT>-99.75</TRNAMT><FITID>ofx_2</FITID><MEMO>Refund</MEMO></STMTTRN>
  </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const GST_JSON = [
  {
    gstin: "27ABCDE1234F1Z5",
    invoiceNo: "INV-100",
    invoiceDate: "2024-03-01",
    taxableValue: 1000,
    cgst: 90,
    sgst: 90,
    igst: 0,
    totalValue: 1180,
  },
  { gstin: "27ABCDE1234F1Z5", invoiceNo: "", invoiceDate: "2024-03-02", taxableValue: "x", cgst: 1, sgst: 1, igst: 0 },
];

const GST_CSV = `gstin,invoiceNo,invoiceDate,taxableValue,cgst,sgst,igst,totalValue
27ABCDE1234F1Z5,INV-C1,2024-03-03,2000,180,180,0,2360
`;

/** Resolve an adapter and parse, failing loudly when the id is unknown. */
function parseWith(id: string, text: string): AdapterResult {
  const adapter = adapterFor(id);
  if (!adapter) throw new Error(`no adapter registered for "${id}"`);
  return adapter.parse(text);
}

describe("adapters", () => {
  it("routes razorpay settlement CSV into gateway SETTLEMENT rows + per-row errors", () => {
    const res = parseWith("razorpay", RAZORPAY_CSV);
    expect(res.source).toBe("gateway");
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      kind: "SETTLEMENT",
      sourceRef: "setl_123",
      amountPaise: 97640,
    });
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].message).toContain("missing date");
    expect(rowErrorSummary(res)).toBe("rows 1, 1 failed: row 3 missing date (settle_time / settle_date)");
  });

  it("parses bank CSV with signed amounts (inflow/outflow)", () => {
    const res = parseWith("bank", BANK_CSV);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ sourceRef: "UTR999", amountPaise: 500000 });
    expect(res.rows[1]).toMatchObject({ sourceRef: "ref_02", amountPaise: -243550 });
    expect(res.errors).toHaveLength(0);
  });

  it("parses OFX STMTTRN blocks", () => {
    const res = parseWith("bank", OFX);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0]).toMatchObject({ sourceRef: "ofx_1", amountPaise: 40025 });
    expect(res.rows[1]).toMatchObject({ sourceRef: "ofx_2", amountPaise: -9975 });
    expect(res.errors).toHaveLength(0);
  });

  it("parses GSTR-2B JSON + CSV variants", () => {
    const j = parseWith("gst2b", JSON.stringify(GST_JSON));
    expect(j.rows).toHaveLength(1);
    expect(j.rows[0]).toMatchObject({ kind: "INVOICE", sourceRef: "INV-100", amountPaise: 118000 });
    expect(j.errors).toHaveLength(1);
    const c = parseWith("gst2b", GST_CSV);
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0].amountPaise).toBe(236000);
    expect(c.errors).toHaveLength(0);
  });

  it("rejects unknown sources and reports header-missing parses", () => {
    expect(adapterFor("nope")).toBeNull();
    const res = parseWith("razorpay", "totally,not,a,real,header\n1,2,3,4,5");
    expect(res.rows).toHaveLength(0);
    expect(res.errors[0].message).toContain("No Razorpay");
  });

  it("routes a Razorpay payments CSV into gateway PAYMENT rows", () => {
    const csv = `Payment Id,Amount,Fee,Tax,Order Id,Email,Created At
pay_abc,1000.00,20.00,3.60,order_1,a@b.com,2024-03-01T10:00:00Z
pay_bad,,,order_2,b@c.com,
`;
    const res = parseWith("razorpay", csv);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      kind: "PAYMENT",
      sourceRef: "pay_abc",
      amountPaise: 100000,
    });
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("parses Stripe and PayU payment CSVs", () => {
    const stripe = parseWith(
      "stripe",
      `id,Amount,Fee,Created,Customer Email
ch_1,25.00,0.75,2026-09-01T10:00:00Z,ada@rhae.in
`,
    );
    expect(stripe.rows).toHaveLength(1);
    expect(stripe.rows[0]).toMatchObject({ kind: "PAYMENT", sourceRef: "ch_1", amountPaise: 2500 });

    const payu = parseWith(
      "payu",
      `mihpayid,amount,addedon,email,status
403993,40.00,2026-09-01T10:00:00Z,ada@rhae.in,success
`,
    );
    expect(payu.rows).toHaveLength(1);
    expect(payu.rows[0].sourceRef).toBe("403993");
    expect(payu.rows[0].amountPaise).toBe(4000);
  });
});
