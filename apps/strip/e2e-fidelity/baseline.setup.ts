import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASELINE_ORIGIN, TARGETS } from "./targets.js";
import { hideAdditionsCss, masks, routeBaseline, settle } from "./shared.js";
import { normalizeDom } from "./normalize-dom.js";
// Project fidelity-baseline: render each original board with support.js (the design runtime) and keep the screenshot.
const outDir = fileURLToPath(new URL("../.fidelity/baseline/", import.meta.url));
test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });
for (const t of TARGETS) {
  test(`baseline ${t.id}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    const external = await routeBaseline(page);
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(BASELINE_ORIGIN + t.board);
    await settle(page);
    expect(await page.locator(".sc-has-error").count(), "no .sc-has-error").toBe(0);
    expect(external, "external hosts requested by support.js").toEqual([]);
    expect(errors, "console errors").toEqual([]);
    await page.screenshot({ path: `${outDir}${t.id}.png`, fullPage: true, animations: "disabled", caret: "hide", mask: masks(page), style: hideAdditionsCss() });
    writeFileSync(`${outDir}${t.id}.dom.json`, JSON.stringify(await page.evaluate(normalizeDom)));
    writeFileSync(`${outDir}${t.id}.size.json`, JSON.stringify(await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))));
  });
}
