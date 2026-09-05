import { orgIdFromUser } from "@/lib/close/org";
import { createClient } from "@/lib/supabase/server";

/**
 * Route-level authorization guard.
 *
 * Roles are ordered owner > accountant > viewer. A role is read from the Supabase auth user's
 * `app_metadata.role` (the provisioning path a real deployment uses). When no role is set on the
 * user we fall back to `DEFAULT_ROLE` from env (default `owner`) — a bootstrap/admin default so the
 * app is usable out of the box in dev; a production deployment should provision real roles and can
 * pin `DEFAULT_ROLE=viewer` to be least-privilege by default.
 *
 * The guard is intentionally decoupled from `next/server` so it can be unit-tested; callers turn a
 * `{ ok:false, status }` verdict into the matching HTTP response with `denied()`.
 */
export type AppRole = "owner" | "accountant" | "viewer";

export const ROLE_RANK: Record<AppRole, number> = { viewer: 1, accountant: 2, owner: 3 };

export function isRole(value: string | null | undefined): value is AppRole {
  return typeof value === "string" && value in ROLE_RANK;
}

/** Read the acting user's role from the Supabase session (null when unauthenticated). */
export async function currentUserRole(): Promise<AppRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const raw = (user.app_metadata?.role ?? user.user_metadata?.role) as unknown;
  if (isRole(raw as string)) return raw as AppRole;

  const fallback = process.env.DEFAULT_ROLE ?? "owner";
  return isRole(fallback) ? fallback : "owner";
}

export async function currentOrgId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return orgIdFromUser(user);
}

/**
 * Role + stable actor id for SoD trails (email when available, else role name).
 * Returns null when unauthenticated.
 */
export async function currentUserActor(): Promise<{ role: AppRole; actor: string; orgId: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const raw = (user.app_metadata?.role ?? user.user_metadata?.role) as unknown;
  let role: AppRole;
  if (isRole(raw as string)) {
    role = raw as AppRole;
  } else {
    const fallback = process.env.DEFAULT_ROLE ?? "owner";
    role = isRole(fallback) ? fallback : "owner";
  }
  return { role, actor: user.email ?? role, orgId: orgIdFromUser(user) };
}

export type AuthVerdict = { ok: true; role: AppRole; orgId: string } | { ok: false; status: 401 | 403 };

/** Allow when the acting role ranks at or above ANY of `allowed`. */
export function authorizeRole(role: AppRole | null, allowed: readonly AppRole[]): boolean {
  if (!role) return false;
  const rank = ROLE_RANK[role];
  return allowed.some((a) => rank >= ROLE_RANK[a]);
}

/**
 * Server-side verdict: authenticated + allowed (ok) / unauthenticated (401) / not-allowed (403).
 * The minimum allowed role is the LOWEST ranked among `allowed` — but pass the exact set for clarity.
 */
export async function requireRole(allowed: readonly AppRole[]): Promise<AuthVerdict> {
  const role = await currentUserRole();
  if (!role) return { ok: false, status: 401 };
  if (!authorizeRole(role, allowed)) return { ok: false, status: 403 };
  const orgId = await currentOrgId();
  return { ok: true, role, orgId };
}

/** Convert a verdict into a NextResponse (imported lazily to keep this module server-agnostic). */
export async function denied(verdict: Extract<AuthVerdict, { ok: false }>) {
  const { NextResponse } = await import("next/server");
  return NextResponse.json(
    { error: verdict.status === 401 ? "Unauthorized" : "Forbidden" },
    { status: verdict.status },
  );
}
