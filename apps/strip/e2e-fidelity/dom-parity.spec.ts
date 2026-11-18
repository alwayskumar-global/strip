import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mapBaselineHrefs, readTree, render } from "./compare.js";
import { skipReason } from "./converted.js";
import { applyAllowlist, unusedEntries } from "./parity-allowlist.js";
import type { NormNode } from "./normalize-dom.js";
import { APP_ORIGIN, TARGETS } from "./targets.js";
import { settleApp } from "./shared.js";
// DOM parity gate (P35, R19.1, R20.1): normalised app tree equals the normalised baseline tree, allowlist aside.
test.use({ reducedMotion: "reduce", deviceScaleFactor: 1 });
const dir = fileURLToPath(new URL("../.fidelity/baseline/", import.meta.url));
for (const t of TARGETS) {
  test(`dom parity ${t.id}`, async ({ page }) => {
    test.skip(skipReason(t.id) !== undefined, skipReason(t.id) ?? "");
    const base = JSON.parse(readFileSync(`${dir}${t.id}.dom.json`, "utf8")) as NormNode;
    mapBaselineHrefs(base);
    const { used } = applyAllowlist(base, t.id);
    expect(unusedEntries(t.id, used), "allowlist entries that matched nothing").toEqual([]);
    await page.setViewportSize({ width: t.width, height: t.height });
    await page.goto(APP_ORIGIN + t.app);
    await settleApp(page, t.id);
    const app = await readTree(page);
    expect(app, ".strip present").not.toBeNull();
    expect(render(app as NormNode)).toBe(render(base));
  });
}
