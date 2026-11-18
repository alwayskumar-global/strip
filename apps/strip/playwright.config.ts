import { defineConfig } from "@playwright/test";
// Bundled Chromium against localhost harnesses only.
// 5173: the Vite dev server (codec harness). 5180/5181: the production build of the harness served with the real
// Strip_CSP (5180) and with a policy lacking 'wasm-unsafe-eval' (5181, negative test).
// 5182/5183/5184: app-server.mjs (production build, gallery build, baseline boards for the fidelity gate).
export default defineConfig({
  retries: 0,
  workers: 4,
  updateSnapshots: "none",
  webServer: [
    { command: "pnpm exec vite", url: "http://127.0.0.1:5173", reuseExistingServer: true },
    {
      command: "pnpm exec vite build -c vite.harness.config.ts && node e2e-harness/server.mjs",
      url: "http://127.0.0.1:5180/e2e-harness/symbols.html",
      reuseExistingServer: true,
      timeout: 180_000,
    },
    { command: "node e2e-harness/app-server.mjs", url: "http://127.0.0.1:5184/Home.dc.html", reuseExistingServer: true },
  ],
  projects: [
    { name: "harness", testDir: "e2e", use: { baseURL: "http://127.0.0.1:5173" } },
    { name: "fidelity-baseline", testDir: "e2e-fidelity", testMatch: "baseline.setup.ts", fullyParallel: true },
    {
      name: "fidelity",
      testDir: "e2e-fidelity",
      testMatch: ["fidelity.spec.ts", "dom-parity.spec.ts", "selftest.spec.ts"],
      dependencies: ["fidelity-baseline"],
      fullyParallel: true,
      snapshotPathTemplate: "{testDir}/../.fidelity/baseline/{arg}{ext}",
    },
  ],
});
