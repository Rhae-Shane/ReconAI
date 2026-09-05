import type { LandingContent } from "./types";

export const landingContent: LandingContent = {
  name: "ReconAI",
  badge: "Razorpay · AI Finance Controller",
  headline: "ReconAI.",
  headlineMuted: "Close the books.",
  subhead:
    "Reconcile Razorpay payments, settlements, refunds and invoices the way a finance team actually does — exact then fuzzy matching first, AI only on leftovers, and an honest exception list.",
  loginHref: "/auth/v1/login",
  marquee: [
    "Settlements",
    "Payments CSV",
    "Refunds",
    "UTR match",
    "Fee netting",
    "Exception list",
    "Close cockpit",
    "Razorpay recon",
  ],
  featuresTitle: "Settlement math you can defend",
  featuresSub: "Gross minus fee, tax on fee, refunds and adjustments must equal the settlement. Always.",
  features: [
    {
      title: "Close cockpit",
      description: "Run a close against live test-mode Razorpay data or a CSV export and watch match rates climb.",
    },
    {
      title: "Exception workbench",
      description: "Every unresolved line has a reason code and expected-vs-actual — no cherry-picked matches.",
    },
    {
      title: "Live Razorpay pull",
      description: "POST /api/close/razorpay/sync pulls payments, settlements and refunds when test keys are set.",
    },
    {
      title: "Deterministic first",
      description: "Exact key, then normalized, then fuzzy. OpenAI only sees the residual ambiguity.",
    },
    {
      title: "Webhook inbox",
      description: "payment.captured, refund.processed, settlement.processed land in an inbox and flush into a close run.",
    },
    {
      title: "Honest metrics",
      description: "Precision and recall against a labeled batch. The exception list is never emptied by hiding rows.",
    },
  ],
  howTitle: "From export to a closed period",
  howSub: "CSV, live pull, or Dashboard webhooks — same close engine.",
  steps: [
    { num: "01", title: "Login", body: "Open the close cockpit as owner or accountant." },
    { num: "02", title: "Ingest", body: "Upload a Razorpay export or sync test-mode settlements." },
    { num: "03", title: "Review exceptions", body: "Every leftover has a reason. Resolve or leave it visible." },
  ],
  snippetFile: "POST /api/close/razorpay/sync",
  snippet: `{
  "mode": "live",
  "counts": {
    "payments": 12,
    "settlements": 3,
    "refunds": 1,
    "records": 18
  }
}`,
  faqs: [
    {
      q: "What is ReconAI?",
      a: "A settlement reconciliation controller for Razorpay. It matches gateway, bank UTR, invoices and refunds, then files anything it cannot prove into an exception list.",
    },
    {
      q: "Do I need API keys?",
      a: "No. CSV upload and the synthetic 81-record batch work with blank keys. Keys enable a live test-mode pull and signed webhooks.",
    },
    {
      q: "Which webhook events?",
      a: "payment.captured, payment.authorized, payment.failed, refund.processed, settlement.processed on /api/webhooks/razorpay.",
    },
    {
      q: "Does AI hide unmatched rows?",
      a: "No. That is the honesty rule. Low-confidence matches stay on the exception list with a reason code.",
    },
    {
      q: "What is the settlement identity?",
      a: "gross − fee − tax_on_fee − refund + adjustment = settlement. Groups carry a netting breakdown.",
    },
    {
      q: "Who can run a close?",
      a: "Owner and accountant roles. Viewers can read reports but cannot ingest or sync.",
    },
  ],
  ctaTitle: "Run a close.",
  ctaBody: "Login to the cockpit. CSV, live Razorpay, or the labeled demo batch.",
  footerBlurb:
    "Reconcile payments, settlements and invoices at scale. Deterministic matching first — AI only on leftovers.",
};
