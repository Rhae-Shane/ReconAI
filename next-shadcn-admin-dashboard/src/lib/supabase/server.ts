import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";

/**
 * Server Supabase client — used from Server Components, Server Actions and route handlers.
 * Reads/writes the auth session cookies via the Next.js cookie store.
 *
 * Note: `cookies()` is async in Next.js 16, so this factory is async. The client is
 * intentionally untyped at the generic level (a hand-written Database schema collapses to
 * `never` under supabase-ssr's generics); read results are cast to the Row types in
 * ./database.types at the call site.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component; safe to ignore when middleware refreshes sessions.
        }
      },
    },
  });
}
