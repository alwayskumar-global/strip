// Test j (P37): a page of several symbols drawn on a canvas and decoded through the worker with maxSymbols above 1,
// under the Strip_CSP read from apps/strip/src/csp.ts.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { STRIP_CSP } from "../src/csp.ts";
import { mulberry32, randomBytes } from "../../../packages/symbols/test/helpers/prng.ts";
const STRIP = "http://127.0.0.1:5180";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
type Api = {
  startWorker(w?: number, h?: number, maxSymbols?: number): Promise<{ ok: boolean; code?: string }>;
  pageViaWorker(hexes: string[]): Promise<{ kind: string; hexes: string[]; skipped: number }>;
  busyDrop(hexes: string[]): Promise<{ first: string; second: string }>;
  violations: string[];
};
const api = (page: Page) => page.evaluate.bind(page);
void api;
const rng = mulberry32(37);
const payloads = [20, 50, 100, 150, 200, 271, 30].map((n) => hex(randomBytes(rng, n)));
async function open(page: Page) {
  const problems: string[] = [];
  const requests: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(`${STRIP}/e2e-harness/symbols.html`);
  await page.waitForFunction(() => "__symbols" in window);
  return { problems, requests };
}
// Feature: symbols, Property 37: a page of several symbols drawn on a canvas and decoded through the worker with maxSymbols above 1 under the Strip_CSP returns every payload of the page
test("j: the worker returns every payload of a page of seven symbols with maxSymbols 9, under the real CSP", async ({ page, request }) => {
  const w = await open(page);
  const head = await request.get(`${STRIP}/e2e-harness/symbols.html`);
  expect(head.headers()["content-security-policy"]).toBe(STRIP_CSP);
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.startWorker(1200, 1200, 9))).toMatchObject({ ok: true });
  const r = await page.evaluate((h) => (window as unknown as { __symbols: Api }).__symbols.pageViaWorker(h), payloads);
  expect(r.kind).toBe("found_many");
  expect(r.skipped).toBe(0);
  expect([...r.hexes].sort()).toEqual([...payloads].sort());
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.violations)).toEqual([]);
  expect(w.problems).toEqual([]);
  expect([...new Set(w.requests.map((u) => new URL(u).origin))]).toEqual([STRIP]);
});
test("j (default): the same page through a worker without maxSymbols returns a single found", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.startWorker(1200, 1200))).toMatchObject({ ok: true });
  const r = await page.evaluate((h) => (window as unknown as { __symbols: Api }).__symbols.pageViaWorker(h), payloads);
  expect(r.kind).toBe("found");
  expect(r.hexes.length).toBe(1);
  expect(payloads).toContain(r.hexes[0]);
});
test("j (busy): a second frame offered while the first decode is in flight is dropped by the client", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.startWorker(1200, 1200, 9))).toMatchObject({ ok: true });
  const r = await page.evaluate((h) => (window as unknown as { __symbols: Api }).__symbols.busyDrop(h), payloads);
  expect(r.second).toBe("dropped");
  expect(r.first).toBe("found_many");
});
