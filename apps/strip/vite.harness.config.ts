import { defineConfig } from "vite";
// Production build of the e2e harness pages (served by e2e-harness/server.mjs). Proves the shipped asset handling:
// a hashed same-origin .wasm, a same-origin module worker, nothing inlined.
export default defineConfig({
  build: {
    outDir: "dist/harness",
    emptyOutDir: true,
    rollupOptions: { input: { codec: "e2e-harness/index.html", symbols: "e2e-harness/symbols.html" } },
  },
  worker: { format: "es" },
});
