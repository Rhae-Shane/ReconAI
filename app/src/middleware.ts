import type { NextRequest } from "next/server";

import { createLogger } from "@/lib/obs/logger";
import { updateSession } from "@/lib/supabase/middleware";

const log = createLogger({ name: "http" });

export async function middleware(request: NextRequest) {
  // Auth is handled by `updateSession` unchanged — access logging is composed around its response.
  const response = await updateSession(request);
  const fields = { method: request.method, path: request.nextUrl.pathname, status: response.status };
  if (response.status >= 500) log.warn("http", fields);
  else log.info("http", fields);
  return response;
}

export const config = {
  /**
   * Run on dashboard (protected) and auth pages. Avoid running on static assets; Next.js
   * matchers already skip `_next/static`, images, favicon, etc. via negative lookaheads.
   */
  matcher: [
    "/dashboard/:path*",
    "/auth/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
