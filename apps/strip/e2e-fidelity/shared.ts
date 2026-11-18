import type { Locator, Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { BASELINE_ORIGIN } from "./targets.js";
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
const FONTS_CSS = fileURLToPath(new URL("../src/styles/fonts.css", import.meta.url));
const LOCAL = new Set(["127.0.0.1", "localhost"]);
/** Baseline-side interception: the Google Fonts CSS comes from the app's fonts.css, other external hosts are aborted and recorded. */
export async function routeBaseline(page: Page): Promise<string[]> {
  const external: string[] = [];
  await page.route((url) => !LOCAL.has(url.hostname), async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "fonts.googleapis.com") {
      const css = readFileSync(FONTS_CSS, "utf8").replace(/url\("\/fonts\/([^"]+)"\)/g, `url("${BASELINE_ORIGIN}/__fonts/$1")`);
      await route.fulfill({ status: 200, contentType: "text/css", body: css });
    } else {
      if (url.hostname !== "fonts.gstatic.com") external.push(url.href);
      await route.abort();
    }
  });
  return external;
}
/** The app draws its codes asynchronously: wait until it shows as many `svg.code` as the baseline board did. */
export async function settleApp(page: Page, id: string): Promise<void> {
  await settle(page);
  const { codes } = JSON.parse(readFileSync(fileURLToPath(new URL(`../.fidelity/baseline/${id}.size.json`, import.meta.url)), "utf8")) as { codes: number };
  await page.waitForFunction((n) => document.querySelectorAll("svg.code").length === n, codes, { timeout: 30_000 });
}
/** Hides `[data-addition]` elements through the CSSOM: the app's CSP (style-src 'self') blocks the screenshot `style` injection. */
export async function hideAdditions(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelectorAll<HTMLElement>("[data-addition]").forEach((e) => e.style.setProperty("display", "none", "important")));
}
