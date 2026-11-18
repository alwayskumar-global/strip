import type { Page } from "@playwright/test";
import { mapHref } from "../src/state/href-map.js";
import { normalizeDom, type NormNode } from "./normalize-dom.js";
export const readTree = (page: Page): Promise<NormNode | null> => page.evaluate(normalizeDom);
/** Maps a board href to the app's target, keeping a #fragment. Unknown hrefs are left as they are. */
export function mapBoardHref(href: string): string {
  const [file = "", hash] = href.split("#") as [string, string | undefined];
  if (file === "") return href;
  const t = mapHref(file);
  if (t.kind === "route" || t.kind === "external") return t.to + (hash === undefined ? "" : `#${hash}`);
  return href;
}
export function mapBaselineHrefs(n: NormNode): void {
  const h = n.attrs["href"];
  if (h !== undefined) n.attrs["href"] = mapBoardHref(h);
  for (const c of n.children) if (typeof c !== "string") mapBaselineHrefs(c);
}
export function render(n: NormNode | string, depth = 0): string {
  if (typeof n === "string") return `${"  ".repeat(depth)}"${n}"\n`;
  const attrs = Object.entries(n.attrs).map(([k, v]) => ` ${k}="${v}"`).join("");
  return `${"  ".repeat(depth)}<${n.tag}${attrs}>\n${n.children.map((c) => render(c, depth + 1)).join("")}`;
}
