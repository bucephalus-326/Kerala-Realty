import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // Small limits so the free-tier guard is testable.
    env: { AI_DAILY_LIMIT: "3", GEMINI_API_KEY: "" },
  },
});
