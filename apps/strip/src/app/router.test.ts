import fc from "fast-check";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapHref } from "../state/href-map.js";
import { ROUTES, ROUTE_IDS } from "../state/routes.js";
import { shouldIntercept, type AnchorLike, type ClickLike } from "./links.js";
import { matchRoute, navLinkCurrent, splitHref, titleOf } from "./router.js";
const ORIGIN = "https://strip.example";
const click = (o: Partial<ClickLike> = {}): ClickLike => ({ defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });
const anchor = (o: Partial<AnchorLike> = {}): AnchorLike => ({ href: `${ORIGIN}/send`, target: "", download: false, rel: "", ...o });
describe("router (R8)", () => {
  // Feature: app, Property 17: for any string, matchRoute returns one of six ids or null, null becomes "/", titleOf equals the board title
  it("P17: matchRoute is total, null falls back to home, titles are the board titles", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const r = matchRoute(s);
        expect(r === null || ROUTE_IDS.includes(r)).toBe(true);
        const id = r ?? "home";
        expect(titleOf(id)).toBe(ROUTES[id].title);
      }),
      { numRuns: 200 },
    );
    for (const id of ROUTE_IDS) {
      expect(matchRoute(ROUTES[id].path)).toBe(id);
      if (id !== "home") expect(matchRoute(`${ROUTES[id].path}/`)).toBe(id);
    }
    expect(matchRoute("/nope")).toBeNull();
    expect(titleOf("receive")).toBe("Receive");
  });
  // Feature: app, Property 18: for any click and anchor description, shouldIntercept is true exactly for plain same-origin known-route left-clicks
  it("P18: shouldIntercept is true exactly for plain same-origin known-route left clicks", () => {
    fc.assert(
      fc.property(
        fc.record({ defaultPrevented: fc.boolean(), button: fc.integer({ min: 0, max: 2 }), metaKey: fc.boolean(), ctrlKey: fc.boolean(), shiftKey: fc.boolean(), altKey: fc.boolean() }),
        fc.record({
          origin: fc.constantFrom(ORIGIN, "https://other.example"),
          path: fc.constantFrom("/", "/send", "/send/screen", "/send/paper", "/receive", "/about", "/THIRD_PARTY_NOTICES", "/x"),
          target: fc.constantFrom("", "_self", "_blank"),
          download: fc.boolean(),
          rel: fc.constantFrom("", "noopener", "external", "noopener external"),
        }),
        (c, a) => {
          const href = `${a.origin}${a.path}`;
          const expected = !c.defaultPrevented && c.button === 0 && !c.metaKey && !c.ctrlKey && !c.shiftKey && !c.altKey && (a.target === "" || a.target === "_self") && !a.download && !/external/.test(a.rel) && a.origin === ORIGIN && matchRoute(a.path) !== null;
          expect(shouldIntercept(c, { href, target: a.target, download: a.download, rel: a.rel }, ORIGIN)).toBe(expected);
        },
      ),
      { numRuns: 300 },
    );
    expect(shouldIntercept(click(), anchor(), ORIGIN)).toBe(true);
    expect(shouldIntercept(click(), anchor({ href: "not a url" }), ORIGIN)).toBe(false);
  });
  // Feature: unit (P19): exactly one nav link (none on "/") has aria-current
  it("P19: per route exactly one nav link, none on home, carries aria-current", () => {
    expect(ROUTE_IDS.map((id) => [id, navLinkCurrent(id)])).toEqual([["home", null], ["send", "send"], ["stream", "send"], ["paper", "send"], ["receive", "receive"], ["about", "about"]]);
  });
  it("splitHref separates path, search and hash", () => {
    expect(splitHref("/about#limits")).toEqual({ path: "/about", search: "", hash: "#limits" });
    expect(splitHref("/send?a=1")).toEqual({ path: "/send", search: "?a=1", hash: "" });
  });
  // Feature: unit (P20): every board href maps to a route, hash, external or dropped target; none to .dc.html
  it("P20: every href in the 34 boards has a mapping, and no target is a .dc.html file", () => {
    const dir = `${process.cwd()}/../../design/project`;
    const hrefs = new Set<string>();
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".dc.html"))) {
      for (const m of readFileSync(`${dir}/${f}`, "utf8").matchAll(/href="([^"{]*)"/g)) hrefs.add(m[1] as string);
    }
    expect(hrefs.size).toBeGreaterThan(10);
    for (const h of hrefs) {
      const t = mapHref(h);
      if (t.kind === "dropped") expect(["strip.css"].includes(h) || h.startsWith("https://fonts.googleapis.com/"), h).toBe(true);
      else expect(t.to.endsWith(".dc.html"), h).toBe(false);
    }
  });
});
