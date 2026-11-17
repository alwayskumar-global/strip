import { defineConfig } from "vitest/config";

// Playwright specs live in e2e/ and run with `pnpm test:e2e`; vitest only runs unit tests under src/.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
