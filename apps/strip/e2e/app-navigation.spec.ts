import { expect, test } from "@playwright/test";
// Link interception and route guards (R8.3, R8.4, R8.6, R8.7): clicks on known routes are history navigation, not page loads.
test("nav links navigate without a page load, set aria-current and the title", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 1));
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(/\/send$/);
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  await expect(page.locator('nav a[aria-current="page"]')).toHaveText("Send");
  await expect(page).toHaveTitle("Send step 1");
  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await expect(page).toHaveURL(/\/receive$/);
  await expect(page).toHaveTitle("Receive");
  await page.goBack();
  await expect(page).toHaveURL(/\/send$/);
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
});
test("/send/screen and /send/paper without a file are replaced by /send; unknown paths by /", async ({ page }) => {
  await page.goto("/send/paper");
  await expect(page).toHaveURL(/\/send$/);
  await page.goto("/send/screen");
  await expect(page).toHaveURL(/\/send$/);
  await page.goto("/nope");
  await expect(page).toHaveURL(/\/$/);
});
test("the notices link is left to the browser (a real navigation)", async ({ page }) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "Third-party notices" });
  await expect(link).toHaveAttribute("href", "/THIRD_PARTY_NOTICES");
});
test("the Home notices link reaches the notices file as plain text", async ({ page }) => {
  await page.goto("/");
  const href = await page.getByRole("link", { name: "Third-party notices" }).getAttribute("href");
  expect(href).toBe("/THIRD_PARTY_NOTICES");
  const res = await page.request.get(href as string);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/plain");
  const body = await res.text();
  for (const n of ["react 19.3.1", "IBM Plex Sans", "zxing-wasm 3.1.7", "qr 0.7.2"]) expect(body).toContain(n);
  await page.getByRole("link", { name: "Third-party notices" }).click();
  await expect(page).toHaveURL(/\/THIRD_PARTY_NOTICES$/);
  await expect(page.locator("body")).toContainText("THIRD-PARTY NOTICES");
});
