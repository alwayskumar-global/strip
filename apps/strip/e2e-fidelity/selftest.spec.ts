import { expect, test } from "@playwright/test";
import { readTree, render } from "./compare.js";
import { applyAllowlist, unusedEntries, type AllowEntry } from "./parity-allowlist.js";
import { BASELINE_ORIGIN, TARGETS } from "./targets.js";
import { masks, routeBaseline, settle } from "./shared.js";
import type { NormNode } from "./normalize-dom.js";
// R20.4, R20.5: the comparison passes a board against its own baseline and fails when 2% of the pixels change.
test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });
const home = TARGETS.find((t) => t.id === "home");
const opts = (page: import("@playwright/test").Page) => ({ fullPage: true, animations: "disabled" as const, caret: "hide" as const, mask: masks(page), stylePath: "e2e-fidelity/hide-additions.css", maxDiffPixelRatio: 0.01 });
async function open(page: import("@playwright/test").Page): Promise<void> {
  if (!home) throw new Error("home target missing");
  await routeBaseline(page);
  await page.setViewportSize({ width: home.width, height: home.height });
  await page.goto(BASELINE_ORIGIN + home.board);
  await settle(page);
}
test("the board compared with its own baseline passes", async ({ page }) => {
  await open(page);
  await expect(page).toHaveScreenshot("home.png", opts(page));
});
test("a 2% pixel region change fails the comparison", async ({ page }) => {
  if (!home) throw new Error("home target missing");
  await open(page);
  const area = home.width * home.height;
  const side = Math.ceil(Math.sqrt(area * 0.025));
  await page.evaluate((s) => {
    const d = document.createElement("div");
    d.setAttribute("style", `position:absolute;left:0;top:0;width:${s}px;height:${s}px;background:#00ff00;z-index:99999`);
    document.body.append(d);
  }, side);
  await expect(page).not.toHaveScreenshot("home.png", opts(page));
});
test("the DOM normaliser is stable and sees a text change; the allowlist rewrites and reports unused entries", async ({ page }) => {
  await open(page);
  const a = (await readTree(page)) as NormNode;
  const b = (await readTree(page)) as NormNode;
  expect(render(a)).toBe(render(b));
  await page.evaluate(() => {
    const h = document.querySelector(".strip h1");
    if (h) h.textContent = `${h.textContent} changed`;
  });
  expect(render((await readTree(page)) as NormNode)).not.toBe(render(a));
  const entry: AllowEntry = { id: "t", targets: ["x"], match: { tag: "a" }, attr: "href", from: "/nope", to: "/y", reason: "self-test" };
  const tree: NormNode = { tag: "div", attrs: {}, children: [{ tag: "a", attrs: { href: "/nope" }, children: ["l"] }] };
  const { used } = applyAllowlist(tree, "x", [entry]);
  expect((tree.children[0] as NormNode).attrs["href"]).toBe("/y");
  expect(unusedEntries("x", used, [entry])).toEqual([]);
  expect(unusedEntries("x", new Set(), [entry])).toEqual(["t"]);
});
