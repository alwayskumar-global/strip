import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Shared by the baseline setup and the fidelity specs: the same waits, masks and CSS on both sides.
export const HIDE_ADDITIONS_CSS = fileURLToPath(new URL("./hide-additions.css", import.meta.url));
export const FONT_FACES = ["400 16px 'IBM Plex Sans'", "500 16px 'IBM Plex Sans'", "600 16px 'IBM Plex Sans'", "400 16px 'IBM Plex Mono'", "500 16px 'IBM Plex Mono'", "600 16px 'IBM Plex Mono'"];
export const MASK_SELECTORS = ["svg.code", ".stage__code", ".fs__code", ".vf__code", ".vf video", ".vf canvas"];
export const masks = (page: Page): Locator[] => MASK_SELECTORS.map((s) => page.locator(s));
export const hideAdditionsCss = (): string => readFileSync(HIDE_ADDITIONS_CSS, "utf8");
/** Wait until `.strip` exists, no `.sc-has-error` does, fonts are loaded, and two animation frames passed. */
export async function settle(page: Page): Promise<void> {
  await page.waitForSelector(".strip", { timeout: 20_000 });
  await page.waitForFunction(() => document.querySelector(".sc-has-error") === null);
  await page.evaluate(async (faces) => {
    await Promise.all(faces.map((f) => document.fonts.load(f)));
    await document.fonts.ready;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
  }, FONT_FACES);
}
