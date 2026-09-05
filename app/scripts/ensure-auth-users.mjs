/**
 * One-shot: create confirmed Auth users in THIS project's Supabase
 * (reads .env.local). Passwords are not written to env.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(import.meta.dirname, "..", ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (!m) return null;
      return [m[1], m[2].trim().replace(/^["']|["']$/g, "")];
    })
    .filter(Boolean),
);

const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !secret || !anon) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY / ANON_KEY");
  process.exit(1);
}

const PASSWORD = "omesh@123";
const users = [
  { email: "owner@omesh.com", role: "owner" },
  { email: "accountant@omesh.com", role: "accountant" },
  { email: "viewer@omesh.com", role: "viewer" },
];

async function admin(path, init) {
  const res = await fetch(`${url}/auth/v1${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secret}`,
      apikey: secret,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

async function login(email, password) {
  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, ok: res.ok };
}

for (const u of users) {
  const created = await admin("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: u.email,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { role: u.role, org_id: "rhae" },
      user_metadata: { role: u.role, name: `Rhae ${u.role}`, org_id: "rhae" },
    }),
  });

  if (created.status === 200 || created.status === 201) {
    console.log(`CREATE ${u.role} ${u.email} HTTP=${created.status} id=${created.json?.id ?? "ok"}`);
  } else {
    const msg = created.json?.msg || created.json?.message || created.json?.error_code || "";
    console.log(`CREATE ${u.role} ${u.email} HTTP=${created.status} ${msg}`);
    // Already exists → reset password + role via list+update if we can find the id
    const listed = await admin(`/admin/users?email=${encodeURIComponent(u.email)}`, { method: "GET" });
    const found =
      listed.json?.users?.find((row) => row.email === u.email) ?? (listed.json?.email === u.email ? listed.json : null);
    if (found?.id) {
      const updated = await admin(`/admin/users/${found.id}`, {
        method: "PUT",
        body: JSON.stringify({
          password: PASSWORD,
          email_confirm: true,
          app_metadata: { ...(found.app_metadata ?? {}), role: u.role },
          user_metadata: { ...(found.user_metadata ?? {}), role: u.role },
        }),
      });
      console.log(`UPDATE ${u.role} ${u.email} HTTP=${updated.status} id=${found.id}`);
    }
  }

  const signed = await login(u.email, PASSWORD);
  console.log(`LOGIN  ${u.role} ${u.email} HTTP=${signed.status} ${signed.ok ? "OK" : "FAIL"}`);
}
