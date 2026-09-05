import { defineConfig } from "vitest/config";

import path from "node:path";

/**
 * App vitest config — unit/integration tests for the ops & close layer.
 *
 * Runs in a plain Node environment (these tests exercise the LangGraph close graph, the BullMQ
 * worker body and the Redis accessors — none of which need a browser or a live broker). The `@/`
 * alias mirrors tsconfig so the same import paths work under vitest.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", ".backup-trim/**"],
    // The LangGraph close graph is CPU-bound and reads a deterministic seeded dataset; keep the
    // pool serial and bump the timeout so the bounded exception-revision loop never flakes.
    pool: "forks",
    testTimeout: 30000,
  },
});
