import { describe, expect, it } from "vitest";

import { detectBankFormat, parseBankStatement, parseCamt053, parseMt940 } from "./bank-parse";

describe("bank statement parsers", () => {
  it("parses MT940 credit lines into bank SETTLEMENT records", () => {
    const text = [
      ":20:TEST",
      ":25:HDFC0000001",
      ":61:2409010914C1234,56NTRFNONREF",
      ":86:UTR HDFC0001ABCDE Razorpay",
    ].join("\n");
    expect(detectBankFormat(text)).toBe("mt940");
    const rows = parseMt940(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.source).toBe("bank");
    expect(rows[0]?.kind).toBe("SETTLEMENT");
    expect(rows[0]?.amountPaise).toBe(123456);
    expect(String(rows[0]?.raw?.utr)).toMatch(/HDFC0001ABCDE|UTR/);
  });

  it("parses CAMT.053 Ntry blocks", () => {
    const xml = `<?xml version="1.0"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
      <Ntry>
        <Amt Ccy="INR">250.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-09-01</Dt></BookgDt>
        <AcctSvcrRef>CAMTUTR99</AcctSvcrRef>
      </Ntry>
    </Document>`;
    expect(detectBankFormat(xml)).toBe("camt");
    const rows = parseCamt053(xml);
    expect(rows[0]).toMatchObject({ source: "bank", kind: "SETTLEMENT", amountPaise: 25000, sourceRef: "CAMTUTR99" });
  });

  it("parses a bank CSV with UTR, amount, date", () => {
    const csv = "utr,amount,date\nHDFC0001,100.50,2026-09-01";
    const rows = parseBankStatement(csv);
    expect(rows[0]?.amountPaise).toBe(10050);
    expect(rows[0]?.sourceRef).toBe("HDFC0001");
  });
});
