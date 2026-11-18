import { expect, test } from "@playwright/test";
// P12 (R1.4, R19.12): six specimen Packets, drawn by the Symbol component, rasterised at 4 px per module,
// are read back by decodeFrame, and the codec accepts what comes out.
test("P12: 6 specimen symbols rasterised at 4 px per module decode to the same Packets", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => m.type() === "error" && violations.push(m.text()));
  await page.goto("/__gallery/symbol-specimens");
  await expect(page.locator("main[data-gallery-ready=yes]")).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("svg.code")).toHaveCount(6);
  expect(await page.locator("svg.code").first().getAttribute("viewBox")).toBe("0 0 145 145");
  for (let i = 0; i < 6; i++) {
    const svg = page.locator(`#specimen-${i} svg.code`);
    await svg.evaluate((el) => {
      (el as SVGElement).style.width = "580px"; // 145 modules x 4 px (CSSOM, allowed under the CSP)
      (el as SVGElement).style.height = "580px";
    });
    const png = await svg.screenshot();
    const r = await page.evaluate(([bytes, idx]) => (window as unknown as { __gallery: { decodePng(b: number[], i: number): Promise<{ kind: string; accepted: boolean; same: boolean }> } }).__gallery.decodePng(bytes as number[], idx as number), [Array.from(png), i] as const);
    expect(r, `specimen ${i}`).toEqual({ kind: "found", accepted: true, same: true });
  }
  expect(violations).toEqual([]);
});
