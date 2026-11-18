import fc from "fast-check";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { encodeSymbol } from "@strip/symbols";
import { attrValues, boardAriaLabels, boardTexts, markupText } from "./board-copy.test-support.js";
import { FullScreenView } from "./FullScreenView.js";
import { StreamView } from "./StreamView.js";
import { streamInput } from "./stream-fixtures.js";
import { toFullScreenVM, toStreamVM, type StreamMode } from "./stream-vm.js";
const matrix = encodeSymbol(Uint8Array.from({ length: 1700 }, (_, i) => (i * 7) & 255), { version: 30, ecc: "L" });
const MODES: StreamMode[] = ["play", "paused", "step"];
const render = (mode: StreamMode): string => renderToStaticMarkup(<StreamView vm={toStreamVM(streamInput(mode, matrix))} />);
describe("StreamView (P15, R3.1 to R3.14)", () => {
  for (const mode of MODES) {
    it(`${mode}: the markup contains the board's active static copy and ARIA text verbatim`, () => {
      const vm = toStreamVM(streamInput(mode, matrix));
      const active = { notStep: vm.notStep, isStep: vm.isStep, isPlay: vm.isPlay, notPlay: vm.notPlay };
      const html = render(mode);
      const text = markupText(html);
      for (const t of boardTexts("SendScreen.dc.html", active)) expect(text, t).toContain(t);
      const labels = attrValues(html, "aria-label");
      for (const l of boardAriaLabels("SendScreen.dc.html", active)) expect(labels, l).toContain(l);
      expect(text).toContain("Flashing content");
      expect(text).toContain("This view flashes. Use step mode if flashing is a problem for you.");
    });
  }
  // Feature: unit (P15): per mode the tag, class, label and note; Previous and Next disabled exactly in play; the range disabled exactly in step
  it("P15: tag, class, label and note per mode; Previous and Next disabled exactly in play; speed range disabled exactly in step", () => {
    const want: Record<StreamMode, [string, string, string, string]> = {
      play: ["Playing", "tag--cobalt", "Pause", "Playing at 8 fps. Pause to step by hand."],
      paused: ["Paused", "tag--signal", "Play", "Paused. Previous and Next step one packet."],
      step: ["Step mode", "tag--solid", "Play", "Step mode: the code changes only when you press Next or Previous."],
    };
    for (const mode of MODES) {
      const vm = toStreamVM(streamInput(mode, matrix));
      expect([vm.modeTag, vm.modeTagCls, vm.ppLabel, vm.modeNote]).toEqual(want[mode]);
      expect(vm.stepOff).toBe(mode === "play");
      expect(vm.isStep).toBe(mode === "step");
      const html = render(mode);
      expect(/<button[^>]*disabled=""[^>]*><svg[^>]*><path d="M20 12H5/.test(html), "Previous").toBe(mode === "play");
      expect(/<input[^>]*type="range"[^>]*disabled=""/.test(html) || /<input[^>]*disabled=""[^>]*type="range"/.test(html), "range").toBe(mode === "step");
    }
  });
  it("for any packet, K, lap and fps the counter, label and notes follow the view-model", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 400 }), fc.integer({ min: 1, max: 9 }), fc.integer({ min: 2, max: 15 }), fc.constantFrom(...MODES), (n, k, lap, fps, mode) => {
        const vm = toStreamVM({ ...streamInput(mode, matrix), n, k, lap, fps });
        const text = markupText(renderToStaticMarkup(<StreamView vm={vm} />));
        expect(text).toContain(`of ${k} + repair`);
        expect(text).toContain(`Lap ${lap}`);
        expect(text).toContain(`${fps} fps`);
        expect(renderToStaticMarkup(<StreamView vm={vm} />)).toContain(`aria-label="Animated code, frame ${n}"`);
        expect(vm.codeLabel).toBe(`Animated data code, packet ${n} of ${k}`);
      }),
      { numRuns: 60 },
    );
  });
  it("the Photosensitivity_Notice is above the stage in every mode and Step mode offers Back to playback", () => {
    for (const mode of MODES) {
      const html = render(mode);
      expect(html.indexOf("Flashing content")).toBeLessThan(html.indexOf('class="stage"'));
      expect(html.includes("Back to playback")).toBe(mode === "step");
      expect(html.includes("Switch to step mode")).toBe(mode !== "step");
    }
  });
});
describe("FullScreenView (R3.13)", () => {
  it("contains the board copy and carries the label, meta and exit link from the view-model", () => {
    const vm = toFullScreenVM(streamInput("play", matrix));
    const html = renderToStaticMarkup(<FullScreenView vm={vm} />);
    const text = markupText(html);
    for (const t of boardTexts("SendScreenFull.dc.html")) expect(text, t).toContain(t);
    expect(text).toContain("Packet 38 of 111 + repair · Lap 1 · 8 fps");
    expect(attrValues(html, "aria-label")).toContain("Animated data code, packet 38 of 111");
    expect(attrValues(html, "href")).toContain("/send/screen");
  });
});
