import { expect, test, type Page } from "@playwright/test";
import { appendFileSync, cpSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
// The service worker (P43, P44, R14.5, R14.6, R14.9): offline use after one visit, and a new version that waits.
test.use({ deviceScaleFactor: 3 });
const ROUTES = ["/", "/send", "/send/screen", "/send/paper", "/receive", "/about"];
const controlled = async (page: Page): Promise<void> => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
};
test("offline after one visit: all six routes, a send and an image decode, with zero failed requests", async ({ page, context }) => {
  test.setTimeout(180_000);
  // Online: first visit installs and activates the worker; make a sheet image to decode later.
  const bytes = Buffer.from(Uint8Array.from({ length: 4096 }, (_, i) => (i * 131 + 7) & 255));
  await page.goto("/");
  await controlled(page);
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).length))).reduce((a, b) => a + b, 0));
  expect(cached).toBeGreaterThanOrEqual(19);
  await page.goto("/send");
  await page.setInputFiles("#file", { name: "o.bin", mimeType: "application/octet-stream", buffer: bytes });
  await expect(page.locator(".filecard__name")).toHaveText("o.bin", { timeout: 30_000 });
  await page.locator('input[name="output"][value="paper"]').check({ force: true });
  await page.getByRole("link", { name: /Continue to Paper/ }).click();
  await expect(page.locator("article.paper").first()).toBeVisible({ timeout: 60_000 });
  await page.emulateMedia({ media: "print" });
  const sheet = await page.locator("article.paper").first().screenshot();
  await page.emulateMedia({ media: "screen" });
  // Offline from here.
  await context.setOffline(true);
  const failed: string[] = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  for (const r of ROUTES) {
    await page.goto(r);
    await expect(page.locator(".strip").first()).toBeVisible();
    await expect(page.locator("header.nav")).toBeVisible();
  }
  await page.goto("/send");
  await page.setInputFiles("#file", { name: "off.bin", mimeType: "application/octet-stream", buffer: bytes });
  await expect(page.locator(".filecard__name")).toHaveText("off.bin", { timeout: 30_000 });
  await page.goto("/receive");
  await page.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: sheet });
  await expect(page.locator(".photo")).toHaveCount(1, { timeout: 60_000 });
  await expect(page.locator(".rx__status h2")).toHaveText("File received", { timeout: 30_000 });
  expect(failed).toEqual([]);
});
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/manifest+json" };
test("a new sw.js stays waiting, has no skipWaiting, and the running page keeps its assets", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), "strip-waiting-"));
  cpSync(join(process.cwd(), "dist/app"), dir, { recursive: true });
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const file = join(dir, path === "/" || !extname(path) ? "index.html" : path);
    try {
      const body = readFileSync(file);
      res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "text/plain", "Cache-Control": "no-store" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  }).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = (server.address() as { port: number }).port;
  try {
    expect(readFileSync(join(dir, "sw.js"), "utf8")).not.toContain("skipWaiting");
    await page.goto(`http://127.0.0.1:${port}/`);
    await controlled(page);
    const before = await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL);
    appendFileSync(join(dir, "sw.js"), "\n// version 2\n"); // a new sw.js (and, as a build would, a new cache name)
    await page.evaluate(async () => void (await navigator.serviceWorker.getRegistration())?.update());
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state ?? null), { timeout: 30_000 })
      .toBe("installed");
    const state = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      const asset = document.querySelector<HTMLScriptElement>("script[type=module]")?.src ?? "";
      return { active: r?.active?.state, activeUrl: r?.active?.scriptURL, waiting: r?.waiting?.state, assetOk: asset !== "" && (await fetch(asset)).ok };
    });
    expect([state.active, state.waiting, state.assetOk]).toEqual(["activated", "installed", true]);
    expect(state.activeUrl).toBe(before);
  } finally {
    server.close();
  }
});
