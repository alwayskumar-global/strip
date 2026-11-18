import { expect, test } from "@playwright/test";
// vercel.json routing mirrored by a local server (port 5185): the headers reach every kind of response (P39, R15.1 to R15.9, R15.11).
const BASE = "http://127.0.0.1:5185";
const SECURITY = {
  "content-security-policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "permissions-policy": "camera=(self)",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
test("the headers are on the HTML, the worker script, the wasm, the service worker, the manifest and the notices", async ({ request }) => {
  const sw = await (await request.get(`${BASE}/sw-manifest.json`)).json() as { precache: string[] };
  const worker = sw.precache.find((u) => u.includes("decode.worker")) as string;
  const wasm = sw.precache.find((u) => u.endsWith(".wasm")) as string;
  const js = sw.precache.find((u) => /\/assets\/index-.*\.js$/.test(u)) as string;
  for (const path of ["/", "/send", "/send/screen", "/send/paper", "/receive", "/about", "/not-a-route", worker, wasm, js, "/sw.js", "/manifest.webmanifest", "/THIRD_PARTY_NOTICES", "/fonts/IBMPlexSans-Regular.woff2", "/icons/icon-192.png"]) {
    const r = await request.get(BASE + path);
    expect(r.status(), path).toBe(200);
    for (const [k, v] of Object.entries(SECURITY)) expect(r.headers()[k], `${path} ${k}`).toBe(v);
  }
  expect((await request.get(BASE + wasm)).headers()["content-type"]).toBe("application/wasm");
  expect((await request.get(`${BASE}/THIRD_PARTY_NOTICES`)).headers()["content-type"]).toBe("text/plain; charset=utf-8");
  expect((await request.get(`${BASE}/sw.js`)).headers()["cache-control"]).toBe("no-cache");
  expect((await request.get(BASE + js)).headers()["cache-control"]).toContain("immutable");
  expect((await request.get(`${BASE}/send`)).headers()["content-type"]).toContain("text/html"); // the rewrite serves the shell
  expect((await request.get(`${BASE}/THIRD_PARTY_NOTICES`)).headers()["content-type"]).not.toContain("html"); // and spares the notices file
});
test("the app runs under these headers: a receive with the worker and wasm, no CSP violation, a registered service worker", async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => ((window as unknown as { __v: string[] }).__v ??= []).push(`${e.violatedDirective} ${e.blockedURI}`)));
  await page.goto(`${BASE}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto(`${BASE}/receive`);
  // Start the worker (wasm init) through an image that holds no code: the outcome is the nocode panel.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: "blank.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("heading", { name: "No code found in this image" })).toBeVisible({ timeout: 30_000 });
  violations.push(...((await page.evaluate(() => (window as unknown as { __v?: string[] }).__v ?? [])) as string[]));
  expect(violations).toEqual([]);
});
