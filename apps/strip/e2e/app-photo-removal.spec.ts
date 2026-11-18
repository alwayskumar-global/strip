import { expect, test } from "@playwright/test";
// Photo removal rebuilds the session (R12.24, R21.11): add 2 photos, remove one, the counters and the thumbnails follow.
test.use({ deviceScaleFactor: 3 });
test("add 2 photos, remove one: progress and thumbnails update to the remaining photo", async ({ page, context }) => {
  test.setTimeout(180_000);
  const bytes = Buffer.from(Uint8Array.from({ length: 40_000 }, (_, i) => (i * 131 + 7 + (i >> 8) * 5) & 255));
  await page.goto("/send");
  await page.setInputFiles("#file", { name: "p.bin", mimeType: "application/octet-stream", buffer: bytes });
  await expect(page.locator(".filecard__name")).toHaveText("p.bin", { timeout: 30_000 });
  await page.locator('input[name="output"][value="paper"]').check({ force: true });
  await page.getByRole("link", { name: /Continue to Paper/ }).click();
  await expect(page.locator("article.paper")).toHaveCount(6, { timeout: 60_000 });
  await page.emulateMedia({ media: "print" });
  const sheets = [await page.locator("article.paper").nth(0).screenshot(), await page.locator("article.paper").nth(1).screenshot()];
  const rx = await context.newPage();
  await rx.goto("/receive");
  for (const [i, img] of sheets.entries()) {
    await rx.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: `sheet-${i + 1}.png`, mimeType: "image/png", buffer: img });
    await expect(rx.locator(".photo")).toHaveCount(i + 1, { timeout: 60_000 });
  }
  await expect(rx.locator(".photos__head .tag")).toHaveText("2 photos · 18 symbols");
  const seen = Number(await rx.locator(".stat__v").first().innerText());
  const solved = Number((await rx.locator(".stat__v").nth(1).innerText()).split("/")[0]);
  expect(seen).toBe(18);
  expect(solved).toBeGreaterThan(0);
  await rx.getByRole("button", { name: "Remove sheet-1.png" }).click();
  await expect(rx.locator(".photo")).toHaveCount(1);
  await expect(rx.locator(".photo__name")).toHaveText("sheet-2.png");
  await expect(rx.locator(".photos__head .tag")).toHaveText("1 photo · 9 symbols");
  // The rebuilt session holds the remaining sheet only: fewer solved blocks than with both.
  await expect.poll(async () => Number((await rx.locator(".stat__v").nth(1).innerText()).split("/")[0])).toBeLessThan(solved);
  await expect.poll(async () => Number(await rx.locator(".stat__v").first().innerText())).toBe(9); // the rebuilt session holds the 9 symbols of the remaining sheet
});
