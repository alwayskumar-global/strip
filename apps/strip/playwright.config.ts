import { defineConfig } from "@playwright/test";
// Bundled Chromium against localhost harnesses only.
// 5173: the Vite dev server (codec harness). 5180/5181: the production build of the harness served with the real
// Strip_CSP (5180) and with a policy lacking 'wasm-unsafe-eval' (5181, negative test).
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://127.0.0.1:5173" },
  webServer: [
    { command: "pnpm exec vite", url: "http://127.0.0.1:5173", reuseExistingServer: true },
    {
      command: "pnpm exec vite build -c vite.harness.config.ts && node e2e-harness/server.mjs",
      url: "http://127.0.0.1:5180/e2e-harness/symbols.html",
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
