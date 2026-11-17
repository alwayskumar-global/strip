// The harness server sends the Strip_CSP header on every response and the right MIME type for .wasm (R9.7).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
const EXPECTED =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const BASE = "http://127.0.0.1:5180";
test("the server sends the Strip_CSP on a page, a script and the .wasm; .wasm is application/wasm", async ({ request, page }) => {
  await page.goto(`${BASE}/e2e-harness/symbols.html`);
  await page.waitForFunction(() => "__symbols" in window);
  const wasmUrl = await page.evaluate(() => (window as unknown as { __symbols: { wasmUrl: string } }).__symbols.wasmUrl);
  const html = await request.get(`${BASE}/e2e-harness/symbols.html`);
  expect(html.headers()["content-security-policy"]).toBe(EXPECTED);
  const scripts = await page.evaluate(() => Array.from(document.scripts, (s) => s.src).filter(Boolean));
  expect(scripts.length).toBeGreaterThan(0);
  const js = await request.get(scripts[0] as string);
  expect(js.headers()["content-security-policy"]).toBe(EXPECTED);
  const wasm = await request.get(new URL(wasmUrl, BASE).toString());
  expect(wasm.status()).toBe(200);
  expect(wasm.headers()["content-security-policy"]).toBe(EXPECTED);
  expect(wasm.headers()["content-type"]).toBe("application/wasm");
  const missing = await request.get(`${BASE}/nope.txt`);
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-security-policy"]).toBe(EXPECTED);
  expect(readFileSync(`${process.cwd()}/src/csp.ts`, "utf8")).toContain(EXPECTED);
});
test("the alternative server omits 'wasm-unsafe-eval' and nothing else", async ({ request }) => {
  const r = await request.get("http://127.0.0.1:5181/e2e-harness/symbols.html");
  expect(r.headers()["content-security-policy"]).toBe(EXPECTED.replace(" 'wasm-unsafe-eval'", ""));
});
