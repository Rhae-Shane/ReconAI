/**
 * Razorpay test-mode credentials (server-only).
 *
 * Same convention as Revenue Recovery / Risk Manager: `RAZORPAY_KEY_ID` +
 * `RAZORPAY_KEY_SECRET` from Dashboard → API Keys (Test mode). The webhook
 * secret is the HMAC key from Dashboard → Webhooks. When either key is missing
 * the live client is a no-op and the close loop keeps using CSV / synthetic
 * batches — same graceful fallback as Redis and OpenAI.
 */

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}

export function razorpayConfig(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim() ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "",
  };
}

export function isRazorpayConfigured(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): boolean {
  return razorpayConfig(env) !== null;
}

/** Webhook HMAC secret can be set independently of API keys (Dashboard → Webhooks). */
export function razorpayWebhookSecret(
  env: Record<string, string | undefined> = typeof process !== "undefined" ? process.env : {},
): string {
  return env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? "";
}

/** Basic-auth header for `https://api.razorpay.com/v1/*`. Never log the secret. */
export function razorpayAuthHeader(cfg: RazorpayConfig): HeadersInit {
  const auth = Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString("base64");
  return { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
}
