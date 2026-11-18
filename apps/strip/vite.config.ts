import { defineConfig } from "vite";
import { SECURITY_HEADERS } from "./src/csp.ts";
// Dev and preview send the same headers as production (src/csp.ts is the single source, R15.7).
export default defineConfig(({ command, mode }) => ({
  define: { __STRIP_GALLERY__: JSON.stringify(command === "serve" || mode === "gallery") },
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true, headers: { ...SECURITY_HEADERS } },
  preview: { headers: { ...SECURITY_HEADERS } },
  build: { outDir: mode === "gallery" ? "dist/gallery" : "dist/app", manifest: true },
}));
