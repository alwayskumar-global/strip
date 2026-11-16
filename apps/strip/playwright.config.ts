import { defineConfig } from "@playwright/test";

// Bundled Chromium against a localhost harness only.
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: {
    command: "pnpm exec vite",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
  },
});
