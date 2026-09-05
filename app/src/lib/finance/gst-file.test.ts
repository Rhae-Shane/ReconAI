import { describe, expect, it } from "vitest";

import { buildGstr1, draftFiling, hashPayload, markSubmitted } from "@/lib/finance/gst-file";

describe("gst-file", () => {
  it("hashes GSTR-1 payload stably and marks sandbox submit", () => {
    const payload = buildGstr1(
      [
        {
          invoiceNo: "pay_1",
          invoiceDate: "2026-09-01",
          taxablePaise: 100000,
          taxPaise: 18000,
          totalPaise: 118000,
          pos: "27",
        },
      ],
      "092026",
    );
    expect(payload.gstin).toBeTruthy();
    expect(Array.isArray(payload.b2cs)).toBe(true);
    const draft = draftFiling("GSTR1", payload, "092026");
    expect(draft.status).toBe("DRAFT");
    expect(draft.hash).toBe(hashPayload(payload));
    const submitted = markSubmitted(draft, "owner", "2026-09-05T00:00:00.000Z");
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedBy).toBe("owner");
  });
});
