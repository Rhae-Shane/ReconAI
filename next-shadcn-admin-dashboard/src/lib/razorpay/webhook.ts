import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay webhook HMAC (same as Growth + Revenue Recovery).
 *
 * Dashboard sends `X-Razorpay-Signature` = hex(HMAC-SHA256(webhook_secret, raw_body)).
 * No secret → deny. Missing/wrong signature → deny. Never trust the JSON first.
 */

export function computeRazorpaySignature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyRazorpaySignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signature) return false;
  const expected = Buffer.from(computeRazorpaySignature(rawBody, secret), "hex");
  const actual = Buffer.from(signature, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
