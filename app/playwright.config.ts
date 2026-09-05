import { defineConfig } from "@playwright/test";

/**
 * E2E smoke configuration for the Reconcile Controller dashboard.
 *
 * The smoke suite (`e2e/`) only exercises non-auth surfaces (health endpoint + web root) so it
 * runs unattended without Supabase credentials. The dev server is booted automatically and
 * reused when one is already running on port 3000.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "next dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
