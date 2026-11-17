import { describe, expect, it } from "vitest";
import viteConfig from "../vite.config.ts";
import { STRIP_CSP } from "./csp.js";
const EXPECTED =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
describe("Strip_CSP (R9.3 to R9.5, R9.7)", () => {
  it("equals the R9.3 string character for character", () => {
    expect(STRIP_CSP).toBe(EXPECTED);
  });
  it("has no unsafe-eval or unsafe-inline, one wasm-unsafe-eval, worker-src 'self', and no img-src or style-src", () => {
    expect(STRIP_CSP).not.toMatch(/'unsafe-eval'/);
    expect(STRIP_CSP).not.toMatch(/'unsafe-inline'/);
    expect(STRIP_CSP.match(/'wasm-unsafe-eval'/g)?.length).toBe(1);
    expect(STRIP_CSP).toContain("worker-src 'self'");
    for (const d of ["img-src", "style-src"]) expect(STRIP_CSP).not.toContain(d);
  });
  it("is the value the Vite dev server and preview server send", () => {
    const cfg = viteConfig as { server?: { headers?: Record<string, string> }; preview?: { headers?: Record<string, string> } };
    expect(cfg.server?.headers?.["Content-Security-Policy"]).toBe(STRIP_CSP);
    expect(cfg.preview?.headers?.["Content-Security-Policy"]).toBe(STRIP_CSP);
  });
});
