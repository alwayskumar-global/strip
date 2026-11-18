import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../vite.config.js";
import { APP_CSP, SECURITY_HEADERS, STRIP_CSP } from "./csp.js";
// Task 4.3 (P39, R15.1 to R15.7): vercel.json repeats the headers of csp.ts character for character; the rewrite spares assets.
interface Rule { source: string; headers?: Array<{ key: string; value: string }>; destination?: string }
const vercel = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, "utf8")) as { headers: Rule[]; rewrites: Rule[]; outputDirectory: string; installCommand: string; buildCommand: string; framework: unknown };
const matches = (source: string, path: string): boolean => new RegExp(`^${source}$`).test(path);
const headersFor = (path: string): Record<string, string> => Object.fromEntries(vercel.headers.filter((r) => matches(r.source, path)).flatMap((r) => (r.headers ?? []).map((h) => [h.key, h.value])));
describe("vercel.json (P39)", () => {
  it("the catch-all entry carries SECURITY_HEADERS exactly, and APP_CSP is the literal policy without unsafe-eval or unsafe-inline", () => {
    const all = vercel.headers.find((r) => r.source === "/(.*)");
    expect(Object.fromEntries((all?.headers ?? []).map((h) => [h.key, h.value]))).toEqual({ ...SECURITY_HEADERS });
    expect(APP_CSP).toBe(STRIP_CSP);
    expect(APP_CSP).toBe("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    expect(APP_CSP).not.toMatch(/(?<!wasm-)unsafe-eval|unsafe-inline/);
    expect(SECURITY_HEADERS["Permissions-Policy"]).toBe("camera=(self)");
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
    expect(APP_CSP).toContain("frame-ancestors 'none'");
  });
  it("Vite dev and preview send the same header strings", () => {
    const c = (config as unknown as (e: { command: string; mode: string }) => { server: { headers: Record<string, string> }; preview: { headers: Record<string, string> } })({ command: "serve", mode: "development" });
    expect(c.server.headers).toEqual({ ...SECURITY_HEADERS });
    expect(c.preview.headers).toEqual({ ...SECURITY_HEADERS });
  });
  it("every response kind gets the security headers once the rules are merged; wasm, notices, manifest and sw.js have their own", () => {
    for (const p of ["/", "/send", "/assets/index-abc.js", "/assets/decode.worker-abc.js", "/assets/zxing_reader-abc.wasm", "/sw.js", "/THIRD_PARTY_NOTICES", "/manifest.webmanifest", "/fonts/x.woff2"]) {
      const h = headersFor(p);
      for (const [k, v] of Object.entries(SECURITY_HEADERS)) expect(h[k], `${p} ${k}`).toBe(v);
    }
    expect(headersFor("/assets/zxing_reader-abc.wasm")["Content-Type"]).toBe("application/wasm");
    expect(headersFor("/THIRD_PARTY_NOTICES")["Content-Type"]).toBe("text/plain; charset=utf-8");
    expect(headersFor("/sw.js")["Cache-Control"]).toBe("no-cache");
    expect(headersFor("/assets/index-abc.js")["Cache-Control"]).toContain("immutable");
  });
  it("every source compiles as a regular expression; the rewrite serves the shell for routes and spares assets", () => {
    for (const r of [...vercel.headers, ...vercel.rewrites]) expect(() => new RegExp(`^${r.source}$`), r.source).not.toThrow();
    const rw = vercel.rewrites[0] as Rule;
    expect(rw.destination).toBe("/index.html");
    for (const p of ["/", "/send", "/send/screen", "/send/paper", "/receive", "/about", "/foo"]) expect(matches(rw.source, p), p).toBe(true);
    for (const p of ["/sw.js", "/manifest.webmanifest", "/assets/x.js", "/fonts/x.woff2", "/icons/x.png", "/THIRD_PARTY_NOTICES"]) expect(matches(rw.source, p), p).toBe(false);
  });
  it("is set up for the app directory as the Vercel root: install at the repo root, build here, output dist/app, no framework", () => {
    expect(vercel.framework).toBeNull();
    expect(vercel.outputDirectory).toBe("dist/app");
    expect(vercel.installCommand).toBe("cd ../.. && pnpm install --frozen-lockfile");
    expect(vercel.buildCommand).toBe("pnpm build");
  });
});
