import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["perf/**/*.perf.ts"], testTimeout: 24 * 3600 * 1000, hookTimeout: 24 * 3600 * 1000 },
});
