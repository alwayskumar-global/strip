import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BASELINE_ORIGIN, TARGETS } from "./targets.js";
import { hideAdditionsCss, masks, settle } from "./shared.js";
// Project fidelity-baseline: render each original board with support.js (the design runtime) and keep the screenshot.
const outDir = fileURLToPath(new URL("../.fidelity/baseline/", import.meta.url));
const fontsCss = fileURLToPath(new URL("../src/styles/fonts.css", import.meta.url));
const local = new Set(["127.0.0.1", "localhost"]);
test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });
mkdirSync(outDir, { recursive: true });
for (const t of TARGETS) {
  test(`baseline ${t.id}`, async ({ page }) => {
    const external: string[] = [];
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(String(e)));
    // Google Fonts CSS is answered from the app's own fonts.css; every other external host is aborted and recorded.
    await page.route((url) => !local.has(url.hostname), async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "fonts.googleapis.com") {
        const css = readFileSync(fontsCss, "utf8").replace(/url\("\/fonts\/([^"]+)"\)/g, `url("${BASELINE_ORIGIN}/__fonts/$1")`);
        await route.fulfill({ status: 200, contentType: "text/css", body: css });
      } else {
        if (url.hostname !== "fonts.gstatic.com") external.push(url.href);
        await route.abort();
      }
    });
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(BASELINE_ORIGIN + t.board);
    await settle(page);
    expect(await page.locator(".sc-has-error").count(), "no .sc-has-error").toBe(0);
    expect(external, "external hosts requested by support.js").toEqual([]);
    expect(errors, "console errors").toEqual([]);
    await page.screenshot({ path: `${outDir}${t.id}.png`, fullPage: true, animations: "disabled", caret: "hide", mask: masks(page), style: hideAdditionsCss() });
    writeFileSync(`${outDir}${t.id}.size.json`, JSON.stringify(await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))));
  });
}
