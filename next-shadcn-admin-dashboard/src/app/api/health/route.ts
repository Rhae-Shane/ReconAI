import { NextResponse } from "next/server";

import { isQueueEnabled } from "@/lib/ops/queue";
import { isRedisConfigured } from "@/lib/ops/redis";
import { isRazorpayConfigured } from "@/lib/razorpay/config";

export const runtime = "nodejs";

/**
 * Liveness/readiness probe for the Controller. Never requires credentials: Redis, the queue,
 * and Razorpay are reported as configured-vs-not and the app degrades gracefully when absent.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "reconai",
    time: new Date().toISOString(),
    checks: {
      redis: isRedisConfigured(),
      queue: isQueueEnabled(),
      razorpay: isRazorpayConfigured(),
    },
  });
}
