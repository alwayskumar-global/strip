import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { attrValues, boardAriaLabels, boardTexts, markupText } from "./board-copy.test-support.js";
import { AboutView } from "./AboutView.js";
import { ErrorPanel } from "./ErrorPanel.js";
import { ErrorsAllView } from "./ErrorsAllView.js";
import { ErrorsView } from "./ErrorsView.js";
import { toAboutVM } from "./about-vm.js";
import { ERROR_KINDS, toErrorVM, toErrorsVM, type ErrorKind } from "./error-vm.js";
const panel = (k: ErrorKind): string => renderToStaticMarkup(<ErrorPanel vm={toErrorVM(k)} />);
describe("ErrorPanel and toErrorVM (P33, R7.2 to R7.15)", () => {
  // Feature: unit (P33): per kind and any context the VM equals Appendix F: copy, rows, icon and hrefs
  it("P33: for each of the 14 kinds the panel shows the Appendix F copy, rows, one icon and the action hrefs", () => {
    expect(ERROR_KINDS).toHaveLength(14);
    for (const k of ERROR_KINDS) {
      const vm = toErrorVM(k);
      const html = panel(k);
      const text = markupText(html);
      for (const v of [vm.tag, vm.title, vm.msg, vm.primary, vm.secondary, ...vm.rows.flatMap((r) => [r.k, r.v])]) expect(text, `${k}: ${v}`).toContain(v);
      expect(html).toContain('role="alert"');
      expect([vm.iconFile, vm.iconCam, vm.iconClock, vm.iconAlert].filter(Boolean)).toHaveLength(1);
      expect(html.match(/<svg class="ico ico--lg"/g)?.length ?? 0).toBe(vm.isStall ? 1 : 1); // the icon (the stall ring has its own svg.ring__svg)
      expect(attrValues(html, "href")).toEqual([vm.primaryHref, vm.secondaryHref]);
      expect(html.includes("<progress")).toBe(k === "size");
      expect(html.includes("ring--sm")).toBe(k === "stall");
      expect(html.includes("err__tips")).toBe(k === "stall");
    }
  });
  it("kinds without rows render an empty dl.kv, as the board does (R7.11)", () => {
    for (const k of ["denied", "nocamera", "internal"] as const) expect(panel(k)).toContain('<dl class="kv"></dl>');
  });
  it("the board's static copy and ARIA text appear for the size and stall kinds", () => {
    const size = { isSize: true, isStall: false, iconFile: true, iconCam: false, iconClock: false, iconAlert: false };
    const stall = { isSize: false, isStall: true, iconFile: false, iconCam: false, iconClock: true, iconAlert: false };
    for (const [k, active] of [["size", size], ["stall", stall]] as const) {
      const html = panel(k);
      const text = markupText(html);
      for (const t of boardTexts("ErrorState.dc.html", active)) expect(text, t).toContain(t);
      for (const l of boardAriaLabels("ErrorState.dc.html", active)) expect(attrValues(html, "aria-label"), l).toContain(l);
    }
  });
  it("for any file name, size and cap the size panel's message, rows and meter ends carry them (R7.3)", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9._-]{1,20}$/), fc.constantFrom("300 KB", "1.4 MB", "12 MB"), fc.integer({ min: 1, max: 1024 }), (fileName, size, capKb) => {
        const vm = toErrorVM("size", { fileName, size, capKb });
        expect(vm.msg).toBe(`${fileName} is ${size}. Strip carries files up to ${capKb} KB. Compress it, or split it into smaller files.`);
        expect(vm.rows).toEqual([{ k: "File", v: fileName }, { k: "Size", v: size }, { k: "Limit", v: `${capKb} KB` }]);
        expect([vm.limitEnd, vm.fileEnd]).toEqual([`${capKb} KB limit`, `${size} file`]);
      }),
    );
  });
  it("About limits opens the Limits section; Choose another file opens Send (R7.3)", () => {
    const vm = toErrorVM("size");
    expect([vm.primaryHref, vm.secondaryHref]).toEqual(["/send", "/about#limits"]);
  });
  it("the stall ring is 74 percent at 82 of 111 and follows the counters", () => {
    expect(toErrorVM("stall").stallPct).toBe(74);
    expect(toErrorVM("stall", { solved: 50, total: 100 }).frozen).toBe("Frozen at 50 / 100");
  });
});
describe("ErrorsView and ErrorsAllView (R6.1 to R6.8)", () => {
  it("Errors shows size, camera and stall; ErrorsAll shows all 14 kinds, with the board copy", () => {
    const three = renderToStaticMarkup(<ErrorsView vm={toErrorsVM(["size", "camera", "stall"])} />);
    expect(three.match(/<section class="strip err"/g)).toHaveLength(3);
    for (const t of boardTexts("Errors.dc.html")) expect(markupText(three), t).toContain(t);
    const all = renderToStaticMarkup(<ErrorsAllView vm={toErrorsVM(ERROR_KINDS)} />);
    expect(all.match(/<section class="strip err"/g)).toHaveLength(14);
    for (const t of boardTexts("ErrorsAll.dc.html")) expect(markupText(all), t).toContain(t);
  });
});
describe("AboutView (R6)", () => {
  it("contains every static text run and ARIA label of the About board verbatim, with its anchors", () => {
    const html = renderToStaticMarkup(<AboutView vm={toAboutVM()} />);
    const text = markupText(html);
    for (const t of boardTexts("About.dc.html")) expect(text, t).toContain(t);
    for (const l of boardAriaLabels("About.dc.html")) expect(attrValues(html, "aria-label"), l).toContain(l);
    for (const id of ["privacy", "account", "caveat", "limits", "credits"]) expect(html, id).toContain(`id="${id}"`);
    expect(html).not.toContain(".dc.html");
  });
});
