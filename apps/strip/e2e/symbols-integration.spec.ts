// Test h: a codec file sent as symbols through canvas, and through SVG rasterised in Chromium, under the real Strip_CSP.
import { expect, test } from "@playwright/test";
const STRIP = "http://127.0.0.1:5180";
type Api = {
  packets(size: number): Promise<string[]>;
  complete(hexes: string[], size: number): Promise<{ complete: boolean; same: boolean }>;
  viaCanvas(hex: string): Promise<string>;
  mountSvg(hex: string, ppm?: number): number;
  decodePng(b64: string): Promise<string>;
  violations: string[];
};
const SIZE = 5000;
test("h: the codec decoder completes with identical bytes through canvas and through SVG", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(m.text()));
  await page.goto(`${STRIP}/e2e-harness/symbols.html`);
  await page.waitForFunction(() => "__symbols" in window);
  const packets = await page.evaluate((n) => (window as unknown as { __symbols: Api }).__symbols.packets(n), SIZE);
  expect(packets.length).toBeGreaterThan(4);

  const viaCanvas: string[] = [];
  for (const h of packets) viaCanvas.push(await page.evaluate((x) => (window as unknown as { __symbols: Api }).__symbols.viaCanvas(x), h));
  expect(viaCanvas).toEqual(packets);
  expect(await page.evaluate(([l, n]) => (window as unknown as { __symbols: Api }).__symbols.complete(l as string[], n as number), [viaCanvas, SIZE])).toEqual({ complete: true, same: true });

  const viaSvg: string[] = [];
  for (const h of packets) {
    await page.evaluate((x) => (window as unknown as { __symbols: Api }).__symbols.mountSvg(x, 4), h);
    const png = await page.locator("#svgbox svg").screenshot();
    viaSvg.push(await page.evaluate((b) => (window as unknown as { __symbols: Api }).__symbols.decodePng(b), png.toString("base64")));
  }
  expect(viaSvg).toEqual(packets);
  expect(await page.evaluate(([l, n]) => (window as unknown as { __symbols: Api }).__symbols.complete(l as string[], n as number), [viaSvg, SIZE])).toEqual({ complete: true, same: true });
  expect(await page.evaluate(() => (window as unknown as { __symbols: Api }).__symbols.violations)).toEqual([]);
  expect(problems).toEqual([]);
});
