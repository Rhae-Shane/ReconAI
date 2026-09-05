import { expect, test } from "@playwright/test";

/**
 * Non-auth smoke tests only. The dashboard and auth flows require Supabase credentials (which CI
 * never has), so these cover the two surfaces that must work unattended: the health probe and the
 * web root. The root is a public landing page; Login on that page goes to `/auth/v1/login`.
 */
test("GET /api/health returns 200 with ok true", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.service).toBe("reconai");
});

test("web root responds and renders a stable string", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: /ReconAI/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Login" }).first()).toBeVisible();
});
