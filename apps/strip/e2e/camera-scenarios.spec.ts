import { expect, test, type Page } from "@playwright/test";
import { blankFrame, wireFrame, writeY4M, type WireSymbol } from "./support/y4m.js";
// Receive scenarios on the fake camera and with mocked getUserMedia (P49, R21.4 to R21.9, R21.11).
const payload = (n: number, seed = 1): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 131 + seed + (i >> 8) * 5) & 255);
// Packets and their symbols come from the harness page (the codec and symbols barrels in a browser), not from Node.
const HARNESS = "http://127.0.0.1:5180/e2e-harness/symbols.html";
async function symbols(page: Page, size: number, seed = 1, tamper = false): Promise<WireSymbol[]> {
  const h = await page.context().newPage();
  await h.goto(HARNESS);
  const out = await h.evaluate(([n, sd, t]) => (window as unknown as { __symbols: { symbolsOf(a: number, b: number, c: boolean): Promise<WireSymbol[]> } }).__symbols.symbolsOf(n as number, sd as number, t as boolean), [size, seed, tamper] as const);
  await h.close();
  return out;
}
const status = (p: Page) => p.locator(".rx__status h2");
const tag = (p: Page) => p.locator(".rx__top .tag");
const start = async (p: Page): Promise<void> => {
  await p.goto("/receive");
  await p.getByRole("button", { name: "Start camera" }).click();
};
const seen = async (p: Page): Promise<number> => Number(await p.locator(".stat__v").first().innerText());
test("repeat: the same frame again shows Duplicate frame", async ({ page }) => {
  writeY4M([wireFrame((await symbols(page, 6000))[0] as WireSymbol)]);
  await start(page);
  await expect(tag(page)).toHaveText("Duplicate frame", { timeout: 30_000 });
  await expect(status(page)).toHaveText("Same frame again");
});
test("dup: packets of a second transfer show Other session", async ({ page }) => {
  // Large files, so neither can complete from a few frames; the first frames may be dropped while the worker starts, so A repeats.
  const a = await symbols(page, 40_000, 1);
  const b = await symbols(page, 40_000, 2);
  writeY4M([a[0], a[0], a[1], a[1], b[0], b[1], b[2]].map((w) => wireFrame(w as WireSymbol)));
  await start(page);
  await expect(tag(page)).toHaveText("Other session", { timeout: 30_000 });
  await expect(status(page)).toHaveText("A different transfer is in view");
});
test("failed: a stream whose content does not match its hash shows Verification failed", async ({ page }) => {
  writeY4M((await symbols(page, 6000, 1, true)).map((w) => wireFrame(w)));
  await start(page);
  await expect(tag(page)).toHaveText("Verification failed", { timeout: 60_000 });
  await expect(status(page)).toHaveText("File does not match");
});
test("restart: Start over sets the counters back to 0", async ({ page }) => {
  writeY4M((await symbols(page, 40_000)).slice(0, 6).map((w) => wireFrame(w)));
  await start(page);
  await expect.poll(() => seen(page), { timeout: 30_000 }).toBeGreaterThan(2);
  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page.locator(".stat__v").first()).toHaveText("0");
  await expect(page.locator(".stat__v").nth(1)).toContainText("0");
});
for (const [name, label] of [["NotAllowedError", "Camera access denied"], ["NotFoundError", "No camera on this device"]] as const) {
  test(`${name}: the receiver shows "${label}"`, async ({ page }) => {
    await page.addInitScript((n) => {
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(Object.assign(new Error("x"), { name: n })), configurable: true });
    }, name);
    await start(page);
    await expect(status(page)).toHaveText(label);
  });
}
test("a browser without the camera API shows the camera panel", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true }));
  await start(page);
  await expect(page.getByRole("heading", { name: "This browser can’t use the camera" })).toBeVisible();
});
test("nocam: photos still complete a file", async ({ page, context }) => {
  test.setTimeout(120_000);
  const bytes = Buffer.from(payload(4096));
  await page.goto("/send");
  await page.setInputFiles("#file", { name: "p.bin", mimeType: "application/octet-stream", buffer: bytes });
  await expect(page.locator(".filecard__name")).toHaveText("p.bin", { timeout: 30_000 });
  await page.locator('input[name="output"][value="paper"]').check({ force: true });
  await page.getByRole("link", { name: /Continue to Paper/ }).click();
  await expect(page.locator("article.paper").first()).toBeVisible({ timeout: 60_000 });
  await page.emulateMedia({ media: "print" });
  const sheet = await page.locator("article.paper").first().screenshot();
  const rx = await context.newPage();
  await rx.addInitScript(() => Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(Object.assign(new Error("x"), { name: "NotFoundError" })), configurable: true }));
  await start(rx);
  await expect(status(rx)).toHaveText("No camera on this device");
  await rx.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: sheet });
  await expect(status(rx)).toHaveText("File received", { timeout: 60_000 });
});
test("nothing: no symbol for 30 s shows the nothing panel (fake clock)", async ({ page }) => {
  writeY4M([blankFrame()]);
  await page.clock.install();
  await start(page);
  await expect(tag(page)).toHaveText("Scanning", { timeout: 30_000 });
  await page.clock.fastForward(31_000);
  await expect(page.getByRole("heading", { name: "Nothing readable for a while" })).toBeVisible({ timeout: 10_000 });
});
test("stall: no new block for 20 s after the first packets shows the stall panel (fake clock)", async ({ page }) => {
  writeY4M((await symbols(page, 40_000)).slice(0, 4).map((w) => wireFrame(w)));
  await page.clock.install();
  await start(page);
  await expect.poll(() => seen(page), { timeout: 30_000 }).toBeGreaterThan(2);
  await page.clock.fastForward(21_000);
  await expect(page.getByRole("heading", { name: "No progress for 20 seconds" })).toBeVisible({ timeout: 10_000 });
});
