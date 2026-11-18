import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { skipReason } from "./converted.js";
import { APP_ORIGIN, TARGETS } from "./targets.js";
import { hideAdditions, masks, settleApp } from "./shared.js";
// Pixel gate (P36, R20.1 to R20.10): app screenshot against the baseline rendered by support.js, QR regions masked.
test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });
for (const t of TARGETS) {
  test(`fidelity ${t.id}`, async ({ page }) => {
    test.skip(skipReason(t.id) !== undefined, skipReason(t.id) ?? "");
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(APP_ORIGIN + t.app);
    await settleApp(page, t.id);
    await hideAdditions(page);
    const opts = { fullPage: true, animations: "disabled" as const, caret: "hide" as const, mask: masks(page), stylePath: "e2e-fidelity/hide-additions.css" };
    // Measure first (threshold 0, to read the exact number of differing pixels for the report), then gate at 1%.
    let pixels = 0;
    try {
      await expect(page).toHaveScreenshot(`${t.id}.png`, { ...opts, maxDiffPixelRatio: 0 });
    } catch (e) {
      const m = /(\d+) pixels \(ratio/.exec(String(e));
      if (!m) throw e; // a size mismatch or another failure is a real failure
      pixels = Number(m[1]);
    }
    const png = readFileSync(fileURLToPath(new URL(`../.fidelity/baseline/${t.id}.png`, import.meta.url)));
    const total = png.readUInt32BE(16) * png.readUInt32BE(20);
    const dir = fileURLToPath(new URL("../.fidelity/results/", import.meta.url));
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}${t.id}.pixel.json`, JSON.stringify({ id: t.id, pixels, total, percent: (100 * pixels) / total }));
    expect(pixels / total, "differing pixel ratio").toBeLessThanOrEqual(0.01);
  });
}
