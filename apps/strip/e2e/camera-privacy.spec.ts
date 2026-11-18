import { expect, test, type Request } from "@playwright/test";
import { blankFrame, writeY4M } from "./support/y4m.js";
// Privacy (P41, P42, R16.1 to R16.7): over send, paper, stream, images and the camera, the app makes only same-origin GET
// requests for files it precached, stores nothing in the browser, and the Cache API holds only the precache list.
test.use({ deviceScaleFactor: 3 });
test("privacy: the request log, and storage after the flows", async ({ browser }) => {
  test.setTimeout(240_000);
  writeY4M([blankFrame()]);
  // A marker in the User-Agent lets the server log tell this test's requests from those of tests running in parallel.
  const marker = `StripPrivacyTest-${Date.now()}`;
  const context = await browser.newContext({ serviceWorkers: "allow", permissions: ["camera"], userAgent: `Mozilla/5.0 (Strip e2e) ${marker}` });
  const log: Array<{ method: string; url: string; sw: boolean; origin: string }> = [];
  context.on("request", (r: Request) => log.push({ method: r.method(), url: r.url(), sw: r.serviceWorker() !== null, origin: new URL(r.url()).origin }));
  const page = await context.newPage();
  const bytes = Buffer.from(Uint8Array.from({ length: 6000 }, (_, i) => (i * 131 + 7) & 255));
  // Install the worker and let it precache.
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  // Send on paper, and keep a sheet image.
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await page.setInputFiles("#file", { name: "p.bin", mimeType: "application/octet-stream", buffer: bytes });
  await expect(page.locator(".filecard__name")).toHaveText("p.bin", { timeout: 30_000 });
  await page.locator('input[name="output"][value="paper"]').check({ force: true });
  await page.getByRole("link", { name: /Continue to Paper/ }).click();
  await expect(page.locator("article.paper").first()).toBeVisible({ timeout: 60_000 });
  await page.emulateMedia({ media: "print" });
  const sheet = await page.locator("article.paper").first().screenshot();
  await page.emulateMedia({ media: "screen" });
  // Send on screen (step mode through reduced motion), two packets.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goBack();
  await page.locator('input[name="output"][value="screen"]').check({ force: true });
  await page.getByRole("link", { name: /Continue to Screen/ }).click();
  await expect(page.locator(".counter__n")).toHaveText("1");
  await page.getByRole("button", { name: /^Next/ }).click();
  await expect(page.locator(".counter__n")).toHaveText("2");
  // Receive: an image, then the camera started and stopped.
  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await page.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: "sheet.png", mimeType: "image/png", buffer: sheet });
  await expect(page.locator(".rx__status h2")).toHaveText("File received", { timeout: 60_000 });
  await page.getByRole("button", { name: "Receive another" }).click();
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator(".rx__top .tag")).toHaveText("Scanning", { timeout: 30_000 });
  await page.getByRole("button", { name: "Stop scanning" }).click();
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page.locator("#privacy")).toBeVisible();
  // P41: the Request_Log.
  const manifest = (await (await page.request.get("/sw-manifest.json")).json()) as { precache: string[] };
  const allowed = new Set([...manifest.precache, "/send", "/send/screen", "/send/paper", "/receive", "/about", "/sw.js", "/sw-manifest.json"]);
  const origin = new URL(page.url()).origin;
  const bad = log.filter((r) => r.origin !== origin || r.method !== "GET" || !allowed.has(new URL(r.url).pathname));
  expect(bad).toEqual([]);
  expect(log.some((r) => /fonts\.(googleapis|gstatic)\.com/.test(r.url))).toBe(false);
  // R18.4: the .wasm reaches the server once, from the service worker's precache at install; the page and its worker are served from the cache.
  // (Playwright attributes a worker's fetch, answered by the service worker, to the page, so the server log is the evidence.)
  const served = (await (await page.request.get("/__requests")).json()) as Array<{ server: string; url: string; ua: string }>;
  const wasmAtServer = served.filter((r) => r.server === "app" && r.ua.includes(marker) && r.url.endsWith(".wasm"));
  console.log(`PRIVACY requests=${log.length} wasmRequestsReachingServer=${wasmAtServer.length}`);
  expect(wasmAtServer).toHaveLength(1);
  // P42: nothing stored; the Cache API holds precache URLs only.
  const store = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    cookie: document.cookie,
    idb: ((await indexedDB.databases?.()) ?? []).length,
    caches: (await Promise.all((await caches.keys()).map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)))).flat(),
  }));
  expect([store.local, store.session, store.cookie, store.idb]).toEqual([0, 0, "", 0]);
  expect((await context.cookies()).length).toBe(0);
  expect(store.caches.length).toBeGreaterThan(0);
  for (const u of store.caches) expect(manifest.precache, u).toContain(u);
  await context.close();
});
