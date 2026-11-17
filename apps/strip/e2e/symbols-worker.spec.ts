// Worker decode without long main-thread tasks (test d, P21), and the wasm init time and size measurement
// under the real Strip_CSP (R7.7, R7.8, R7.9).
import { readdirSync, statSync } from "node:fs";
import { expect, test } from "@playwright/test";
const STRIP = "http://127.0.0.1:5180";
const PAGE = `${STRIP}/e2e-harness/symbols.html`;
type Api = {
  startWorker(): Promise<{ ok: boolean; code?: string; message?: string }>;
  workerSequence(n: number): Promise<{ found: number; dropped: number; notFound: number; errors: number; exact: number; ms: number; longTasks: number[]; observerSupported: boolean }>;
  measureInit(): Promise<number>;
  wasmUrl: string;
  violations: string[];
};
// Feature: symbols, Property 21: while the worker decodes a frame sequence, the main thread records no longtask over 50 ms attributable to decoding
test("d: the worker decodes 40 frames and the main thread has no long task over 50 ms", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
  await page.goto(PAGE);
  await page.waitForFunction(() => "__symbols" in window);
  const started = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.startWorker());
  expect(started, "the worker must start under the Strip_CSP").toMatchObject({ ok: true });
  const r = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.workerSequence(40));
  expect(r.observerSupported).toBe(true);
  expect(r.errors).toBe(0);
  expect(r.found + r.dropped + r.notFound).toBe(40);
  expect(r.found).toBe(40);
  expect(r.exact).toBe(r.found);
  const longest = Math.max(0, ...r.longTasks);
  test.info().annotations.push({ type: "worker-sequence", description: `40 frames in ${r.ms.toFixed(0)} ms, long tasks: ${JSON.stringify(r.longTasks)}` });
  console.log(`worker sequence: ${r.found}/40 found in ${r.ms.toFixed(0)} ms; main-thread long tasks: ${JSON.stringify(r.longTasks)}`);
  expect(longest).toBeLessThanOrEqual(50);
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.violations)).toEqual([]);
  expect(problems).toEqual([]);
});

test("wasm init time (compile plus instantiate, 5 fresh pages, real CSP) and built .wasm size", async ({ browser }) => {
  const times: number[] = [];
  for (let i = 0; i < 5; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(PAGE);
    await page.waitForFunction(() => "__symbols" in window);
    times.push(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.measureInit()));
    await ctx.close();
  }
  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted[2] as number;
  const assets = `${process.cwd()}/dist/harness/assets`;
  const wasmFile = readdirSync(assets).find((f) => /^zxing_reader-[\w-]+\.wasm$/.test(f)) as string;
  const size = statSync(`${assets}/${wasmFile}`) as unknown as { size: number };
  console.log(`WASM_INIT_MS median=${median.toFixed(1)} runs=${times.map((t) => t.toFixed(1)).join(",")} WASM_BYTES=${size.size} file=${wasmFile}`);
  expect(median).toBeLessThanOrEqual(500);
  expect(size.size).toBeLessThanOrEqual(1_000_000);
});
