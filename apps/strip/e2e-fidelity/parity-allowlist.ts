import type { NormNode } from "./normalize-dom.js";
// Known, justified deviations between the app and the baseline board. Each entry rewrites the BASELINE tree so that it
// equals what the app is specified to render. An entry that matches nothing in a target it lists fails the test.
export interface AllowEntry {
  id: string;
  targets: string[];
  /** Matches elements by tag and, optionally, by direct text. */
  match: { tag: string; text?: string };
  attr: string;
  from: string;
  to: string;
  reason: string;
}
export const ALLOWLIST: AllowEntry[] = [
  {
    id: "about-limits",
    targets: ["error-size", "errors", "errors-mobile", "errors-all", "errors-all-mobile"],
    match: { tag: "a", text: "About limits" },
    attr: "href",
    from: "/about",
    to: "/about#limits",
    reason: "R7.3: the size panel's secondary action opens the Limits section of About; the board links to the page only.",
  },
];
const textOf = (n: NormNode): string => n.children.map((c) => (typeof c === "string" ? c : textOf(c))).join(" ");
/** Applies the entries for `target` to a baseline tree in place; returns the ids that matched at least once. */
export function applyAllowlist(tree: NormNode, target: string, entries: AllowEntry[] = ALLOWLIST): { used: Set<string> } {
  const used = new Set<string>();
  const visit = (n: NormNode): void => {
    for (const e of entries) {
      if (!e.targets.includes(target) || n.tag !== e.match.tag) continue;
      if (e.match.text !== undefined && textOf(n).trim() !== e.match.text) continue;
      if (n.attrs[e.attr] === e.from) {
        n.attrs[e.attr] = e.to;
        used.add(e.id);
      }
    }
    for (const c of n.children) if (typeof c !== "string") visit(c);
  };
  visit(tree);
  return { used };
}
export function unusedEntries(target: string, used: Set<string>, entries: AllowEntry[] = ALLOWLIST): string[] {
  return entries.filter((e) => e.targets.includes(target) && !used.has(e.id)).map((e) => e.id);
}
