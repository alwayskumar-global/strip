import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["perf/measured/**/*.measured.ts"], testTimeout: 3600 * 1000, hookTimeout: 3600 * 1000 },
});
