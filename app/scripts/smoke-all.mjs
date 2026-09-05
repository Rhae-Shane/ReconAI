/**
 * One-shot smoke: sign in as demo owner, hit every API + UI route.
 * Prints METHOD PATH STATUS TIME snippet — no secrets.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createBrowserClient } from "@supabase/ssr";

const envPath = resolve(import.meta.dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (!m) return null;
      return [m[1], m[2].trim().replace(/^["']|["']$/g, "")];
    })
    .filter(Boolean),
);

const BASE = "http://127.0.0.1:3000";
const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error("Missing Supabase URL / anon key");
  process.exit(1);
}

const jar = [];
const supabase = createBrowserClient(url, anon, {
  cookies: {
    getAll: () => jar,
    setAll: (cookies) => {
      for (const c of cookies) {
        const i = jar.findIndex((x) => x.name === c.name);
        if (i >= 0) jar[i] = { name: c.name, value: c.value };
        else jar.push({ name: c.name, value: c.value });
      }
    },
  },
});

const { data, error } = await supabase.auth.signInWithPassword({
  email: "owner@omesh.com",
  password: "omesh@123",
});
if (error || !data.session) {
  console.error("LOGIN_FAIL", error?.message ?? "no session");
  process.exit(1);
}

const cookieHeader = jar.map((c) => `${c.name}=${c.value}`).join("; ");
const results = [];

async function hit(method, path, { body, headers, timeoutMs, expect } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs ?? 45000);
  const started = Date.now();
  let status = 0;
  let snippet = "";
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      signal: ac.signal,
      redirect: "manual",
      headers: {
        cookie: cookieHeader,
        connection: "close",
        ...(body && !(body instanceof FormData) ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    snippet = text.replace(/\s+/g, " ").slice(0, 120);
  } catch (e) {
    status = 0;
    snippet = e.name === "AbortError" ? "TIMEOUT" : String(e.message ?? e);
  } finally {
    clearTimeout(t);
  }
  const ms = Date.now() - started;
  const ok =
    expect != null
      ? expect.includes(status)
      : status >= 200 && status < 400;
  results.push({ ok, method, path, status, ms, snippet });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${mark} ${method.padEnd(6)} ${String(status).padStart(3)} ${String(ms).padStart(5)}ms  ${path}  ${snippet}`);
}

// --- public / unauth-shaped ---
await hit("GET", "/api/health", { expect: [200] });
await hit("POST", "/api/webhooks/razorpay", {
  body: { event: "payment.captured", payload: {} },
  expect: [401],
});
await hit("POST", "/api/finance/gst/b2b", {
  body: {
    gstr2b: [
      {
        supplierGstin: "27AAAAA0000A1Z5",
        invoiceNo: "INV-1",
        invoiceDate: "2026-08-14",
        taxablePaise: 10000,
        taxPaise: 1800,
        totalPaise: 11800,
        source: "gstr2b",
      },
    ],
    internal: [
      {
        supplierGstin: "27AAAAA0000A1Z5",
        invoiceNo: "INV-1",
        invoiceDate: "2026-08-14",
        taxablePaise: 10000,
        taxPaise: 1800,
        totalPaise: 11800,
        source: "internal",
      },
    ],
  },
  expect: [200],
});

// --- close reads ---
await hit("GET", "/api/close/runs");
await hit("GET", "/api/close/runs/run_today");
await hit("GET", "/api/close/runs/run_yesterday");
await hit("GET", "/api/close/runs/run_failed");
await hit("GET", "/api/close/runs/failed");
await hit("GET", "/api/close/runs/run_today/report");
await hit("GET", "/api/close/runs/run_today/report?format=csv");
await hit("GET", "/api/close/exceptions");
await hit("GET", "/api/close/exceptions/exc_0/evidence");
await hit("GET", "/api/close/alerts");
await hit("GET", "/api/close/reconcile?runId=run_today");
await hit("GET", "/api/close/razorpay/sync");
await hit("GET", "/api/metrics");
await hit("GET", "/api/finance/metrics");
await hit("GET", "/api/finance/periods");
await hit("GET", "/api/finance/ledger");
await hit("GET", "/api/finance/fx");
await hit("GET", "/api/ops/webhooks");
await hit("GET", "/api/finance/dossier/run_today/export");

// --- close writes / tools (safe-ish) ---
await hit("POST", "/api/close/exceptions/exc_0/evidence", {
  body: { label: "smoke-proof", ref: "smoke-001" },
});
await hit("POST", "/api/close/exceptions/exc_0/resolve", {
  body: { status: "REVIEWED", note: "smoke review" },
});
await hit("POST", "/api/close/agents/tools", {
  body: { name: "settlementQuery", input: { query: "How many settlements?" }, runId: "run_today" },
});
await hit("POST", "/api/close/agents/chat", {
  timeoutMs: 25000,
  body: {
    runId: "run_today",
    messages: [{ role: "user", content: "How many settlements are recorded?" }],
  },
});
await hit("POST", "/api/control/policy", {
  body: {
    candidateId: "c1",
    kind: "MATCH",
    matchType: "EXACT",
    amountPaise: 100,
    variance: 0,
    confidence: 0.99,
    deterministicRuleMatched: true,
    unresolvedOpen: false,
  },
});
await hit("POST", "/api/control/materiality", {
  body: { variancePaise: 500, basePaise: 100000 },
});
await hit("POST", "/api/control/audit/verify", { body: { links: [] } });
await hit("POST", "/api/control/approvals", {
  body: {
    action: "submit",
    actor: "reviewer.solo",
    runId: "run_today",
    type: "adjustment",
    amountPaise: 1000,
    requestedBy: "reviewer.solo",
  },
});
await hit("POST", "/api/control/approvals/workflow", {
  body: {
    action: "submit",
    actor: "reviewer.solo",
    runId: "run_today",
    type: "adjustment",
    amountPaise: 1000,
    requestedBy: "reviewer.solo",
  },
});
await hit("POST", "/api/finance/fx", {
  body: { action: "convert", amountPaise: 10000, from: "USD", to: "INR", rate: 83.2 },
});
await hit("POST", "/api/finance/periods", {
  body: {
    period: {
      id: "fy26-smoke",
      label: "Smoke FY26",
      startIso: "2026-04-01T00:00:00.000Z",
      endIso: "2027-03-31T00:00:00.000Z",
      status: "open",
    },
  },
});
await hit("POST", "/api/finance/ledger", {
  body: {
    entries: [
      { account: "Cash", debitPaise: 100, creditPaise: 0, periodId: "fy26-smoke", memo: "smoke" },
      { account: "Sales", debitPaise: 0, creditPaise: 100, periodId: "fy26-smoke", memo: "smoke" },
    ],
  },
});
await hit("POST", "/api/close/runs/schedule", {
  body: { runId: "run_today", runAt: new Date(Date.now() + 3600_000).toISOString() },
});
await hit("POST", "/api/close/runs/run_today/post", { body: { periodId: "fy26-smoke" } });
await hit("POST", "/api/close/runs/run_failed/retry", { body: {} });

const form = new FormData();
form.append(
  "payments.csv",
  new Blob(
    ["paymentId,orderId,amount,fee,settlementId,settlementDate\npay_smoke,ord_smoke,100.00,2.00,setl_smoke,2026-08-14\n"],
    { type: "text/csv" },
  ),
  "payments.csv",
);
form.append(
  "settlements.csv",
  new Blob(["settlementId,amount,utr,date\nsetl_smoke,98.00,UTR_SMOKE,2026-08-14\n"], { type: "text/csv" }),
  "settlements.csv",
);
await hit("POST", "/api/close/upload", { body: form, timeoutMs: 20000 });
await hit("POST", "/api/ops/webhooks", { body: { url: "https://example.com/reconai-hook", events: ["close.completed"] } });
await hit("DELETE", "/api/ops/webhooks", { body: { url: "https://example.com/reconai-hook" } });
await hit("GET", "/api/close/razorpay/sync");
await hit("POST", "/api/close/razorpay/sync", { timeoutMs: 20000 });

// --- UI pages (must 200, contain title) ---
const pages = [
  ["/", "ReconAI"],
  ["/auth/v1/login", "Welcome"],
  ["/dashboard/close", "Close Controller"],
  ["/dashboard/close/run_today", "run_today"],
  ["/dashboard/close/exceptions", "Exceptions"],
  ["/dashboard/close/settlement", "Settlement"],
  ["/dashboard/close/forecast", "forecast"],
  ["/dashboard/close/tax", "Tax"],
  ["/dashboard/close/metrics", "Metrics"],
];
for (const [path, needle] of pages) {
  const before = results.length;
  await hit("GET", path, { timeoutMs: 20000, expect: [200, 307] });
  const last = results[before];
  if (last?.status === 200 && !last.snippet.toLowerCase().includes(needle.toLowerCase())) {
    last.ok = false;
    console.log(`WARN missing "${needle}" in ${path}`);
  }
}

const pass = results.filter((r) => r.ok).length;
const fail = results.filter((r) => !r.ok);
console.log("\n=== SUMMARY ===");
console.log(`pass=${pass} fail=${fail.length} total=${results.length}`);
for (const f of fail) {
  console.log(`  FAIL ${f.method} ${f.path} -> ${f.status} ${f.snippet}`);
}
process.exit(fail.length ? 1 : 0);
