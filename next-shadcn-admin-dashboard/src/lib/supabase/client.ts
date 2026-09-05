import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — used from Client Components for interactive auth (sign in/out)
 * and any browser-session reads. Live recalculation of the design engine never touches this;
 * reference data is passed down from the Server Component instead.
 */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
