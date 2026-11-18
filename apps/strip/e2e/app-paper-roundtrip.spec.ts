import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
// The paper round trip (P46, P47, R10.8 to R10.11, R21.1, R21.2): file -> codec -> print layout pages -> page images ->
// receiver (production build, real worker and wasm) -> byte-identical file. Pages are rendered in print media at DPR 3.
test.use({ deviceScaleFactor: 3 });
const payload = (n: number): Buffer => Buffer.from(Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7 + (i >> 8) * 5) & 255));
interface Case {
  label: string;
  size: number;
  name: string;
  mime: string;
  paper: "a4" | "letter";
}
const CASES: Case[] = [
  { label: "4 KB A4", size: 4096, name: "small.bin", mime: "application/octet-stream", paper: "a4" },
  { label: "40 KB Letter", size: 40_000, name: "report 2026.txt", mime: "text/plain", paper: "letter" },
  { label: "184 KB A4 (milestone)", size: 188_416, name: "field-notes-2026.pdf", mime: "application/pdf", paper: "a4" },
];
const results: unknown[] = [];
async function sendToPaper(page: Page, c: Case, bytes: Buffer): Promise<{ T: number; K: number; N: number }> {
  await page.goto("/send");
  await page.setInputFiles("#file", { name: c.name, mimeType: c.mime, buffer: bytes });
  await expect(page.locator(".filecard__name")).toHaveText(c.name, { timeout: 60_000 });
  const encoded = (await page.locator(".kv__row", { hasText: "Encoded" }).locator("dd").innerText()).trim();
  const m = /(\d+) packets · (\d+) symbols/.exec(encoded);
  const K = Number(m?.[1]);
  const T = Number(m?.[2]);
  await page.locator('input[name="output"][value="paper"]').check({ force: true });
  await page.getByRole("link", { name: /Continue to Paper/ }).click(); // intercepted: no page load, the Sender_File stays in memory
  await expect(page).toHaveURL(/\/send\/paper$/);
  const N = Math.ceil(T / 9);
  await expect(page.locator("article.paper")).toHaveCount(N, { timeout: 120_000 });
  return { T, K, N };
}
for (const c of CASES) {
  test(`P46 print layout: ${c.label} has exactly N sheets of the paper size, headers, no tile clipped`, async ({ page }) => {
    test.setTimeout(240_000);
    const { T, N } = await sendToPaper(page, c, payload(c.size));
    if (c.paper === "letter") await page.locator("#paper-letter").check({ force: true });
    await page.emulateMedia({ media: "print" });
    for (let p = 1; p <= N; p++) await expect(page.locator("article.paper").nth(p - 1).locator(".paper__page")).toHaveText(`Page ${p} of ${N}`);
    const clipped = await page.evaluate(() => {
      const bad: string[] = [];
      for (const art of Array.from(document.querySelectorAll("article.paper"))) {
        const box = art.getBoundingClientRect();
        for (const t of Array.from(art.querySelectorAll(".tile"))) {
          const r = t.getBoundingClientRect();
          if (r.left < box.left - 0.5 || r.right > box.right + 0.5 || r.top < box.top - 0.5 || r.bottom > box.bottom + 0.5) bad.push(t.textContent ?? "");
        }
      }
      return bad;
    });
    expect(clipped).toEqual([]);
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const text = pdf.toString("latin1");
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBe(N);
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(text);
    const [wMm, hMm] = [(Number(box?.[1]) * 25.4) / 72, (Number(box?.[2]) * 25.4) / 72];
    const want = c.paper === "a4" ? [210, 297] : [215.9, 279.4];
    expect(Math.abs(wMm - (want[0] as number))).toBeLessThan(1);
    expect(Math.abs(hMm - (want[1] as number))).toBeLessThan(1);
    expect(T).toBeGreaterThan(0);
  });
}
for (const c of CASES) {
  test(`P47 round trip: ${c.label} rebuilds a byte-identical file from the sheet images (last sheet withheld still completes where repair covers it)`, async ({ page, context }) => {
    test.setTimeout(480_000);
    const bytes = payload(c.size);
    const t0 = Date.now();
    const { T, K, N } = await sendToPaper(page, c, bytes);
    if (c.paper === "letter") await page.locator("#paper-letter").check({ force: true });
    await page.emulateMedia({ media: "print" });
    const t1 = Date.now();
    const images: Buffer[] = [];
    for (let p = 0; p < N; p++) images.push(await page.locator("article.paper").nth(p).screenshot());
    const t2 = Date.now();
    await page.emulateMedia({ media: "screen" });
    // The receiver is a fresh page of the same origin: nothing is shared with the sender but the images.
    const rx = await context.newPage();
    // Record the MIME type of the download Blob (the browser download API does not expose it).
    await rx.addInitScript(() => {
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b: Blob | MediaSource): string => {
        (window as unknown as { __blobType: string }).__blobType = (b as Blob).type;
        return orig(b);
      };
    });
    await rx.goto("/receive");
    const t3 = Date.now();
    const perPage: number[] = [];
    const add = async (img: Buffer, i: number): Promise<void> => {
      await rx.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: `sheet-${i + 1}.png`, mimeType: "image/png", buffer: img });
      await expect.poll(async () => (await rx.locator(".photo").count()) + (await rx.locator(".rx__status h2").innerText().catch(() => "")).length * 0, { timeout: 120_000 }).toBeGreaterThanOrEqual(i + 1);
    };
    // All N sheets, in order, until the file is complete.
    for (let i = 0; i < N; i++) {
      await add(images[i] as Buffer, i);
      const found = (await rx.locator(".photo").nth(i).locator("p.t-small").innerText()).match(/(\d+)/)?.[1];
      perPage.push(Number(found));
      if (await rx.locator(".rx__status h2", { hasText: "File received" }).count()) break;
    }
    await expect(rx.locator(".rx__status h2")).toHaveText("File received", { timeout: 60_000 });
    const t4 = Date.now();
    const [download] = await Promise.all([rx.waitForEvent("download"), rx.getByRole("button", { name: /^Download/ }).click()]);
    expect(download.suggestedFilename()).toBe(c.name);
    const path = await download.path();
    const got = (await import("node:fs")).readFileSync(path);
    expect(Buffer.compare(got, bytes)).toBe(0);
    expect(await rx.evaluate(() => (window as unknown as { __blobType: string }).__blobType)).toBe(c.mime);
    const row = { case: c.label, bytes: c.size, K, T, pages: N, symbolsPerPage: perPage, pagesNeeded: perPage.length, sendAndLayoutMs: t1 - t0, screenshotMs: t2 - t1, receiveMs: t4 - t3, totalMs: t4 - t0 };
    results.push(row);
    console.log(`ROUNDTRIP ${JSON.stringify(row)}`);
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/paper-roundtrip.json", JSON.stringify(results, null, 1));
    await rx.close();
  });
}
test("P47 withholding the last sheet still completes (184 KB)", async ({ page, context }) => {
  test.setTimeout(480_000);
  const c = CASES[2] as Case;
  const bytes = payload(c.size);
  const { N } = await sendToPaper(page, c, bytes);
  await page.emulateMedia({ media: "print" });
  const images: Buffer[] = [];
  for (let p = 0; p < N - 1; p++) images.push(await page.locator("article.paper").nth(p).screenshot()); // the last sheet is not captured
  const rx = await context.newPage();
  await rx.goto("/receive");
  for (let i = 0; i < images.length; i++) {
    await rx.locator('input[type="file"][accept^="image"]').first().setInputFiles({ name: `sheet-${i + 1}.png`, mimeType: "image/png", buffer: images[i] as Buffer });
    await expect.poll(async () => rx.locator(".photo").count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(i + 1);
    if (await rx.locator(".rx__status h2", { hasText: "File received" }).count()) break;
  }
  await expect(rx.locator(".rx__status h2")).toHaveText("File received", { timeout: 60_000 });
  const [download] = await Promise.all([rx.waitForEvent("download"), rx.getByRole("button", { name: /^Download/ }).click()]);
  expect(Buffer.compare((await import("node:fs")).readFileSync(await download.path()), bytes)).toBe(0);
});
