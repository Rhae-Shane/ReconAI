/**
 * Tenant key for close-run isolation.
 *
 * Demo users share `CLOSE_ORG_ID` (default `rhae`). A real tenant stamps
 * `app_metadata.org_id` on the Supabase user; every close read/write filters on it.
 */

export const DEFAULT_ORG_ID = "rhae";

/** Rhae (demo merchant) — format-valid GSTIN, not a live GSTN registration. */
export const DEFAULT_ORG_GSTIN = "27AABCR0001R1Z5";

/** Razorpay Software Pvt Ltd — published GSTIN used on fee tax invoices. */
export const RAZORPAY_GSTIN = "29AAGCR4375J1ZU";

export interface OrgProfile {
  id: string;
  name: string;
  gstin: string;
  stateCode: string;
  legalName: string;
}

export function defaultCloseOrgId(): string {
  return process.env.CLOSE_ORG_ID?.trim() || DEFAULT_ORG_ID;
}

export function orgGstin(): string {
  const raw = process.env.ORG_GSTIN?.trim().toUpperCase();
  return raw && GSTIN_RE.test(raw) ? raw : DEFAULT_ORG_GSTIN;
}

export function razorpayGstin(): string {
  const raw = process.env.RAZORPAY_GSTIN?.trim().toUpperCase();
  return raw && GSTIN_RE.test(raw) ? raw : RAZORPAY_GSTIN;
}

export function orgDisplayName(): string {
  return process.env.ORG_DISPLAY_NAME?.trim() || "Rhae";
}

export function orgProfile(): OrgProfile {
  const gstin = orgGstin();
  return {
    id: defaultCloseOrgId(),
    name: orgDisplayName(),
    gstin,
    stateCode: gstin.slice(0, 2),
    legalName: process.env.ORG_LEGAL_NAME?.trim() || "Rhae Technologies Pvt Ltd",
  };
}

export function orgIdFromUser(user: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null): string {
  const raw = user?.app_metadata?.org_id ?? user?.user_metadata?.org_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return defaultCloseOrgId();
}

/** GSTIN: 2-digit state + 10-char PAN + entity + Z + checksum. */
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
