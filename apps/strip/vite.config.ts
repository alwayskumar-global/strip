import { defineConfig } from "vite";
import { STRIP_CSP } from "./src/csp.ts";
const headers = { "Content-Security-Policy": STRIP_CSP };
export default defineConfig({
  server: { host: "127.0.0.1", port: 5173, strictPort: true, headers },
  preview: { headers },
});
