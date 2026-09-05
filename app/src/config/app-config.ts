import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "ReconAI",
  version: packageJson.version,
  copyright: `© ${currentYear}, ReconAI.`,
  meta: {
    title: "ReconAI - Razorpay Settlement Reconciliation",
    description:
      "ReconAI reconciles Razorpay payments, settlements and invoices at scale - deterministic-first matching with an AI resolver for the residual, honest exception reporting, and a human-review workbench. Built with Next.js 16 and shadcn/ui.",
  },
};
