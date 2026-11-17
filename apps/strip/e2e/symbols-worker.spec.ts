// Worker decode without long main-thread tasks (test d, P21), and the wasm init time and size measurement
// under the real Strip_CSP (R7.7, R7.8, R7.9).
import { readdirSync, statSync } from "node:fs";
import { chromium, expect, test } from "@playwright/test";
const STRIP = "http://127.0.0.1:5180";
const PAGE = `${STRIP}/e2e-harness/symbols.html`;
type Api = {
  startWorker(): Promise<{ ok: boolean; code?: string; message?: string }>;
  workerSequence(n: number): Promise<{ found: number; dropped: number; notFound: number; errors: number; exact: number; ms: number; longTasks: number[]; observerSupported: boolean }>;
  measureInit(): Promise<{ initMs: number; firstDecodeMs: number; found: boolean }>;
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

test("wasm init time and first decode (5 fresh browser processes, real CSP, no cache) and built .wasm size", async () => {
  // A fresh browser per run: no HTTP cache, no compiled-code cache and no shared V8 state, so the module is cold.
  const inits: number[] = [];
  const firsts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const browser = await chromium.launch();
    const page = await (await browser.newContext()).newPage();
    await page.goto(PAGE);
    await page.waitForFunction(() => "__symbols" in window);
    const r = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.measureInit());
    expect(r.found).toBe(true);
    inits.push(r.initMs);
    firsts.push(r.firstDecodeMs);
    await browser.close();
  }
  const med = (a: number[]): number => [...a].sort((x, y) => x - y)[2] as number;
  const assets = `${process.cwd()}/dist/harness/assets`;
  const wasmFile = readdirSync(assets).find((f) => /^zxing_reader-[\w-]+\.wasm$/.test(f)) as string;
  const size = statSync(`${assets}/${wasmFile}`) as unknown as { size: number };
  console.log(
    `WASM_INIT_MS median=${med(inits).toFixed(1)} runs=${inits.map((t) => t.toFixed(1)).join(",")} FIRST_DECODE_MS median=${med(firsts).toFixed(1)} runs=${firsts.map((t) => t.toFixed(1)).join(",")} TOTAL_MS=${(med(inits) + med(firsts)).toFixed(1)} WASM_BYTES=${size.size} file=${wasmFile}`,
  );
  expect(med(inits)).toBeLessThanOrEqual(500);
  expect(size.size).toBeLessThanOrEqual(1_000_000);
});
