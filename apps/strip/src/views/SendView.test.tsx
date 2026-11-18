import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { attrValues, boardAriaLabels, boardTexts, markupText } from "./board-copy.test-support.js";
import { BAD_FACTS, FILE_FACTS } from "./send-fixtures.js";
import { SendView } from "./SendView.js";
import { toSendVM, type SendStage } from "./send-vm.js";
import type { SendVM } from "./send-vm.js";
const STAGES: SendStage[] = ["chosen", "empty", "toolarge", "emptyfile"];
const vmOf = (stage: SendStage): SendVM => toSendVM({ stage, file: FILE_FACTS, bad: BAD_FACTS[stage === "emptyfile" ? "emptyfile" : "toolarge"] });
const flags = (v: SendVM): Record<string, boolean> => ({ isChosen: v.isChosen, isNone: v.isNone, isBad: v.isBad, choicesOff: v.choicesOff });
describe("SendView (R2.1 to R2.17)", () => {
  for (const stage of STAGES) {
    it(`${stage}: the markup contains the board's active static copy and ARIA text verbatim`, () => {
      const vm = vmOf(stage);
      const html = renderToStaticMarkup(<SendView vm={vm} />);
      const text = markupText(html);
      for (const t of boardTexts("Send.dc.html", flags(vm))) expect(text, t).toContain(t);
      const labels = attrValues(html, "aria-label");
      for (const l of boardAriaLabels("Send.dc.html", flags(vm))) expect(labels, l).toContain(l);
    });
  }
  it("chosen shows the file card values from the view-model; the bad stages show the rejected-file card and the alert", () => {
    const chosen = markupText(renderToStaticMarkup(<SendView vm={vmOf("chosen")} />));
    for (const v of [FILE_FACTS.name, FILE_FACTS.mime, FILE_FACTS.size, FILE_FACTS.bytes, ...FILE_FACTS.hash, FILE_FACTS.encoded, FILE_FACTS.within, FILE_FACTS.screenNote, FILE_FACTS.paperNote]) expect(chosen, v).toContain(v);
    for (const s of ["toolarge", "emptyfile"] as const) {
      const html = renderToStaticMarkup(<SendView vm={vmOf(s)} />);
      const b = BAD_FACTS[s];
      for (const v of [b.name, b.type, b.size, b.limit, b.title, b.msg]) expect(markupText(html), v).toContain(v);
      expect(html).toContain('role="alert"');
      expect(html).toContain("drop--error");
    }
  });
  it("only the chosen stage has a link to the Screen route; the other stages have a disabled button", () => {
    expect(renderToStaticMarkup(<SendView vm={vmOf("chosen")} />)).toContain('href="/send/screen"');
    for (const s of ["empty", "toolarge", "emptyfile"] as const) {
      const html = renderToStaticMarkup(<SendView vm={vmOf(s)} />);
      expect(html).not.toContain('href="/send/screen"');
      expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Continue to Screen/);
      expect(html).toContain("<fieldset");
      expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    }
  });
  it("toSendVM: choices are off, and the radio is unchecked, exactly outside the chosen stage", () => {
    for (const s of STAGES) {
      const v = vmOf(s);
      expect(v.choicesOff).toBe(s !== "chosen");
      expect(v.screenOn).toBe(s === "chosen");
      expect(v.isBad).toBe(s === "toolarge" || s === "emptyfile");
    }
  });
});
