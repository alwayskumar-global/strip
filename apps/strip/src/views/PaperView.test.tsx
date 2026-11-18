import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { encodeSymbol } from "@strip/symbols";
import { attrValues, boardAriaLabels, boardTexts, markupText } from "./board-copy.test-support.js";
import { PaperView } from "./PaperView.js";
import { paperInput } from "./paper-fixtures.js";
import { toPaperVM, type PaperSize } from "./paper-vm.js";
const matrix = encodeSymbol(Uint8Array.from({ length: 1700 }, (_, i) => (i * 11) & 255), { version: 30, ecc: "L" });
const nine = Array.from({ length: 9 }, () => matrix);
const render = (size: PaperSize): string => renderToStaticMarkup(<PaperView vm={toPaperVM(paperInput(size, nine))} />);
describe("PaperView (R4.1 to R4.14)", () => {
  for (const size of ["a4", "letter"] as const) {
    it(`${size}: the markup contains the board's static copy and ARIA text verbatim, and 9 tiles`, () => {
      const html = render(size);
      const text = markupText(html);
      for (const t of boardTexts("SendPaper.dc.html")) expect(text, t).toContain(t);
      const labels = attrValues(html, "aria-label");
      for (const l of boardAriaLabels("SendPaper.dc.html")) expect(labels, l).toContain(l);
      expect(html.match(/<figure class="tile">/g)).toHaveLength(9);
      expect(html).toContain("P1·01");
      expect(html).toContain("9/149");
    });
  }
  it("the size radios follow the view-model and the app never sets paper--letter (R4.14)", () => {
    expect(render("a4")).toMatch(/id="paper-a4"[^>]*checked=""/);
    expect(render("letter")).toMatch(/id="paper-letter"[^>]*checked=""/);
    expect(render("letter")).not.toContain("paper--letter");
  });
  it("renders every page of the view-model, hides all but the previewed one with paper--off, and labels the Print button", () => {
    const base = paperInput("a4", nine);
    const page = base.pages[0] as NonNullable<(typeof base.pages)[0]>;
    const vm = toPaperVM({ ...base, total: 3, previewIndex: 1, pages: [page, page, page] });
    const html = renderToStaticMarkup(<PaperView vm={vm} />);
    expect(html.match(/<article class="paper/g)).toHaveLength(3);
    expect(html.match(/paper--off/g)).toHaveLength(2);
    expect(vm.preview).toBe("2 / 3");
    expect(vm.prevOff).toBe(false);
    expect(vm.nextOff).toBe(false);
    expect(vm.printLabel).toBe("Print 3 pages");
    expect(toPaperVM({ ...base, total: 1 }).printLabel).toBe("Print 1 page");
    expect(toPaperVM(base).prevOff).toBe(true);
  });
});
