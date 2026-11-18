import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { encodeSymbol } from "@strip/symbols";
import { attrValues, boardAriaLabels, boardTexts, markupText } from "./board-copy.test-support.js";
import { HomeView } from "./HomeView.js";
import { toHomeVM } from "./home-vm.js";
const matrix = encodeSymbol(Uint8Array.from({ length: 1700 }, (_, i) => i & 255), { version: 30, ecc: "L" });
const html = renderToStaticMarkup(<HomeView vm={toHomeVM(Array.from({ length: 6 }, () => ({ matrix })))} />);
describe("HomeView (R1.1 to R1.7)", () => {
  it("contains every static text run and aria-label of the Home board verbatim", () => {
    const text = markupText(html);
    for (const t of boardTexts("Home.dc.html")) expect(text, t).toContain(t);
    const labels = attrValues(html, "aria-label");
    for (const l of boardAriaLabels("Home.dc.html")) expect(labels, l).toContain(l);
  });
  it("shows six specimen codes, three links to the notices, the app and GitHub, and the board's links as routes", () => {
    expect(html.match(/<svg class="code"/g)).toHaveLength(6);
    const hrefs = attrValues(html, "href");
    for (const h of ["/", "/send", "/receive", "/about", "/THIRD_PARTY_NOTICES", "https://github.com/alwayskumar-global/strip"]) expect(hrefs, h).toContain(h);
    expect(html).not.toContain(".dc.html");
  });
  it("adds the mobile class only when the view-model says so", () => {
    expect(html).toContain('class="strip page "');
    expect(renderToStaticMarkup(<HomeView vm={toHomeVM([], "page--m")} />)).toContain("strip page page--m");
  });
});
