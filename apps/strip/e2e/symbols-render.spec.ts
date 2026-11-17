// Tests e and f: canvas pixels, SVG raster, built wasm facts, and Node-vs-Chromium matrix parity.
import { readdirSync, statSync } from "node:fs";
import { encodeSymbol, QR_CAPACITY_BY_VERSION } from "@strip/symbols";
import type { EccLevel } from "@strip/symbols";
import { expect, test } from "@playwright/test";
import fc from "fast-check";
import { matrixToImageData } from "../../../packages/symbols/test/helpers/matrix-to-image.ts";
import { mulberry32, randomBytes } from "../../../packages/symbols/test/helpers/prng.ts";
const STRIP = "http://127.0.0.1:5180";
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
type Api = {
  canvasRaster(hex: string, ppm: number, qz: number, ecc: EccLevel): { width: number; height: number; hash: number; nonBinary: number };
  matrixOf(hex: string, version: number, ecc: EccLevel): { version: number; mask: number; size: number; modules: string };
  mountSvg(hex: string, ppm: number, ecc: EccLevel, version?: number): number;
  decodePng(b64: string): Promise<string>;
  wasmUrl: string;
};
const fnv = (d: Uint8ClampedArray): number => {
  let h = 2166136261;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ (d[i] as number), 16777619) >>> 0;
  return h;
};
test.beforeEach(async ({ page }) => {
  await page.goto(`${STRIP}/e2e-harness/symbols.html`);
  await page.waitForFunction(() => "__symbols" in window);
});
// Feature: symbols, Property 6: for any matrix, ppm in 1..8 and quiet zone at least 4, canvas pixels in Chromium equal matrixToImageData and every pixel is exactly the dark or light colour
test("e: canvas pixels in Chromium equal matrixToImageData, with no blended pixel (ppm 1..8, quiet zone >= 4)", async ({ page }) => {
  let runs = 0;
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 60 }),
      fc.integer({ min: 0, max: 2 ** 31 - 1 }),
      fc.integer({ min: 1, max: 8 }),
      fc.integer({ min: 4, max: 8 }),
      fc.constantFrom<EccLevel>("L", "M", "Q", "H"),
      async (len, seed, ppm, qz, ecc) => {
        const bytes = randomBytes(mulberry32(seed), len);
        const img = matrixToImageData(encodeSymbol(bytes, { ecc }), ppm, qz);
        const r = await page.evaluate(([h, p, q, e]) => (window as unknown as { __symbols: Api }).__symbols.canvasRaster(h as string, p as number, q as number, e as EccLevel), [hex(bytes), ppm, qz, ecc]);
        expect(r.width).toBe(img.width);
        expect(r.height).toBe(img.height);
        expect(r.nonBinary).toBe(0);
        expect(r.hash).toBe(fnv(img.data));
        runs++;
      },
    ),
    { numRuns: 40, seed: 6 },
  );
  expect(runs).toBe(40);
});
test("e (SVG): the SVG rasterised in Chromium decodes to the input bytes (P8, R4.6)", async ({ page }) => {
  for (const [len, ecc] of [[1, "L"], [37, "M"], [200, "Q"], [300, "H"], [1000, "L"]] as const) {
    const bytes = randomBytes(mulberry32(len * 31), len);
    await page.evaluate(([h, e]) => (window as unknown as { __symbols: Api }).__symbols.mountSvg(h as string, 4, e as EccLevel), [hex(bytes), ecc]);
    const png = await page.locator("#svgbox svg").screenshot();
    const out = await page.evaluate((b) => (window as unknown as { __symbols: Api }).__symbols.decodePng(b), png.toString("base64"));
    expect(out, `len ${len} ecc ${ecc}`).toBe(hex(bytes));
  }
});
test("e (wasm): the built .wasm URL is not data: and the file is at most 1,000,000 bytes (R7.8)", async ({ page }) => {
  const url = await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.wasmUrl);
  expect(url.startsWith("data:")).toBe(false);
  const dir = `${process.cwd()}/dist/harness/assets`;
  const file = readdirSync(dir).find((f) => /^zxing_reader-[\w-]+\.wasm$/.test(f)) as string;
  expect(url.endsWith(file)).toBe(true);
  expect((statSync(`${dir}/${file}`) as unknown as { size: number }).size).toBeLessThanOrEqual(1_000_000);
});
// Feature: symbols, Property 23: for any fixed set of inputs (seeded bytes at versions 1, 2, 7, 10, 20, 30, 40 and each ecc), the matrices encoded in Node equal the matrices encoded by the same encoder in Chromium
test("f: matrices encoded in Node equal matrices encoded in Chromium (versions 1, 2, 7, 10, 20, 30, 40 at each ecc)", async ({ page }) => {
  let cases = 0;
  for (const version of [1, 2, 7, 10, 20, 30, 40]) {
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      const cap = (QR_CAPACITY_BY_VERSION[version] as Record<EccLevel, number>)[ecc];
      const bytes = randomBytes(mulberry32(version * 100 + ecc.charCodeAt(0)), cap);
      const node = encodeSymbol(bytes, { version, ecc });
      const browser = await page.evaluate(([h, v, e]) => (window as unknown as { __symbols: Api }).__symbols.matrixOf(h as string, v as number, e as EccLevel), [hex(bytes), version, ecc]);
      expect(browser.version).toBe(node.version);
      expect(browser.mask).toBe(node.mask);
      expect(browser.size).toBe(node.size);
      expect(browser.modules).toBe(node.modules.map((x) => (x ? "1" : "0")).join(""));
      cases++;
    }
  }
  expect(cases).toBe(28);
});
