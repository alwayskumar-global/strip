import { expect, test } from "@playwright/test";
import { skipReason } from "./converted.js";
import { APP_ORIGIN, TARGETS } from "./targets.js";
import { masks, settle } from "./shared.js";
// Pixel gate (P36, R20.1 to R20.10): app screenshot against the baseline rendered by support.js, QR regions masked.
test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });
for (const t of TARGETS) {
  test(`fidelity ${t.id}`, async ({ page }) => {
    test.skip(skipReason(t.id) !== undefined, skipReason(t.id) ?? "");
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(APP_ORIGIN + t.app);
    await settle(page);
    await expect(page).toHaveScreenshot(`${t.id}.png`, {
      fullPage: true,
      animations: "disabled",
      caret: "hide",
      mask: masks(page),
      stylePath: "e2e-fidelity/hide-additions.css",
      maxDiffPixelRatio: 0.01,
    });
  });
}
