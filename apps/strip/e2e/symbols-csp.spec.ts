// Symbols under the real Strip_CSP in bundled Chromium against the production build of the harness.
// Tests a, b, c, i of the symbols design (R8.5, R9.1, R9.2, R9.4, R9.7 to R9.10, R11.8).
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";
const EXPECTED =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const STRIP = "http://127.0.0.1:5180";
const ALT = "http://127.0.0.1:5181";
const PAGE = "/e2e-harness/symbols.html";
type Api = {
  wasmUrl: string;
  violations: string[];
  roundTrip(size?: number): Promise<{ ok: boolean; complete?: boolean; packets?: number; same?: boolean; code?: string; message?: string }>;
  decodeOnce(hex: string): Promise<{ ok: boolean; kind?: string; hex?: string; code?: string; message?: string }>;
  startWorker(): Promise<{ ok: boolean; code?: string }>;
};
function watch(page: Page) {
  const consoleProblems: string[] = [];
  const requests: string[] = [];
  const responses: Response[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleProblems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleProblems.push(`pageerror: ${e.message}`));
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => responses.push(r));
  return { consoleProblems, requests, responses };
}
async function open(page: Page, origin: string) {
  await page.goto(`${origin}${PAGE}`);
  await page.waitForFunction(() => "__symbols" in window);
}

// Feature: symbols, Property 15: the served Content-Security-Policy header equals the R9.3 string exactly on the page, the worker script and the .wasm, with zero violations and zero console errors
test("a: encode, canvas, decode and the codec round trip run under the real Strip_CSP with no violation and no console problem", async ({ page }) => {
  const w = watch(page);
  await open(page, STRIP);
  const r = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.roundTrip(6000));
  expect(r).toMatchObject({ ok: true, complete: true, same: true });
  const viol = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.violations);
  expect(viol).toEqual([]);
  expect(w.consoleProblems).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.decodeOnce("00ff10802a"))).toMatchObject({ ok: true, kind: "found", hex: "00ff10802a" });
});

test("b: under a CSP without 'wasm-unsafe-eval' the same page fails with UNSUPPORTED_ENVIRONMENT", async ({ page }) => {
  await open(page, ALT);
  const r = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.decodeOnce("0102030405"));
  expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_ENVIRONMENT" });
  const viol = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.violations);
  expect(viol.join(" ")).toMatch(/script-src/);
});

// Feature: symbols, Property 16: every recorded request goes to the harness origin, none to another origin, and the .wasm is requested from the same origin
test("c: only same-origin requests, none to jsDelivr; the CSP header is on the page, worker and .wasm; .wasm is application/wasm", async ({ page, request }) => {
  const w = watch(page);
  await request.get(`${STRIP}/__reset`);
  await open(page, STRIP);
  const started = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.startWorker());
  expect(started.ok).toBe(true);
  const rt = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.roundTrip(3000));
  expect(rt.ok).toBe(true);
  const origins = new Set(w.requests.map((u) => new URL(u).origin));
  expect([...origins]).toEqual([STRIP]);
  expect(w.requests.some((u) => /jsdelivr/i.test(u))).toBe(false);
  const wasmUrl = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.wasmUrl);
  const wasmAbs = new URL(wasmUrl, STRIP).toString();
  expect(w.requests).toContain(wasmAbs);
  const kinds = new Set<string>();
  for (const r of w.responses) {
    const url = r.url();
    if (!url.startsWith(STRIP)) continue;
    expect(r.headers()["content-security-policy"], url).toBe(EXPECTED);
    if (url.endsWith(".wasm")) {
      kinds.add("wasm");
      expect(r.headers()["content-type"]).toBe("application/wasm");
    } else if (/decode\.worker-[\w-]+\.js$/.test(url)) kinds.add("worker");
    else if (url.endsWith(".html")) kinds.add("page");
  }
  expect([...kinds].sort()).toEqual(["page", "wasm", "worker"]);
  const log = (await (await request.get(`${STRIP}/__requests`)).json()) as Array<{ url: string; host: string }>;
  expect(log.length).toBeGreaterThan(2);
  for (const e of log) expect(e.host).toBe("127.0.0.1:5180");
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.violations)).toEqual([]);
  expect(w.consoleProblems).toEqual([]);
});

test("i: the production build emits a hashed same-origin .wasm, not inlined, that decodes; apps/strip has no zxing-wasm dependency", async ({ page }) => {
  await open(page, STRIP);
  const wasmUrl = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.wasmUrl);
  expect(wasmUrl.startsWith("data:")).toBe(false);
  expect(wasmUrl).toMatch(/^\/assets\/zxing_reader-[\w-]+\.wasm$/);
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.decodeOnce("deadbeef"))).toMatchObject({ ok: true, kind: "found", hex: "deadbeef" });
  const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8")) as Record<string, Record<string, string> | undefined>;
  for (const k of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    expect(Object.keys(pkg[k] ?? {})).not.toContain("zxing-wasm");
    expect(Object.keys(pkg[k] ?? {})).not.toContain("qr");
  }
});
