import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests target the pure core in `src/lib` only, so they run in plain
 * Node: no DOM, no React. UI behaviour is covered by Playwright (`e2e/`).
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    // A zone ahead of UTC, so code that should use the user's local date but uses UTC fails.
    env: { TZ: "Europe/Tallinn" },
  },
});
