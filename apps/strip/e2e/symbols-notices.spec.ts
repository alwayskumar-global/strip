// Test g (R15.5): THIRD_PARTY_NOTICES is served from the same origin and linked from the app.
import { expect, test } from "@playwright/test";
test("g: the app links THIRD_PARTY_NOTICES and the file is served from the same origin", async ({ page, request }) => {
  await page.goto("/");
  const link = page.locator("a#notices");
  await expect(link).toHaveText(/third-party notices/i);
  const href = await link.evaluate((a) => (a as HTMLAnchorElement).href);
  expect(new URL(href).origin).toBe(new URL(page.url()).origin);
  expect(new URL(href).pathname).toBe("/THIRD_PARTY_NOTICES");
  const res = await request.get(href);
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body).toContain("qr 0.7.2");
  expect(body).toContain("zxing-wasm 3.1.7");
  expect(body).toContain("Apache License");
});
test("g: the production harness build serves the same file as text with the Strip_CSP header", async ({ request }) => {
  const res = await request.get("http://127.0.0.1:5180/THIRD_PARTY_NOTICES");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  expect(res.headers()["content-security-policy"]).toContain("'wasm-unsafe-eval'");
  expect(await res.text()).toContain("TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION");
});
