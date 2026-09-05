/**
 * Tenant key for close-run isolation.
 *
 * Demo users share `CLOSE_ORG_ID` (default `superkalam`). A real tenant stamps
 * `app_metadata.org_id` on the Supabase user; every close read/write filters on it.
 */
export function defaultCloseOrgId(): string {
  return process.env.CLOSE_ORG_ID?.trim() || "superkalam";
}

export function orgIdFromUser(user: {
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
} | null): string {
  const raw = user?.app_metadata?.org_id ?? user?.user_metadata?.org_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return defaultCloseOrgId();
}
