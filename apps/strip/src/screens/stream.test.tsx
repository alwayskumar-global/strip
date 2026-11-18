import { encodeSymbol } from "@strip/symbols";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isSpaceTarget, prefersReducedMotion } from "../services/browser.js";
import { canPrev, initialStream, reduceStream } from "../state/stream.js";
import { markupText } from "../views/board-copy.test-support.js";
import { FullScreenView } from "../views/FullScreenView.js";
import { StreamView } from "../views/StreamView.js";
import { toFullScreenVM, toStreamVM, type StreamInput } from "../views/stream-vm.js";
const matrix = encodeSymbol(Uint8Array.from({ length: 1700 }, (_, i) => (i * 3) & 255), { version: 30, ecc: "L" });
const input = (over: Partial<StreamInput>): StreamInput => ({ mode: "play", n: 1, k: 111, t: 149, lap: 1, fps: 8, fileTag: "f.pdf · 184 KB", matrix, ...over });
describe("StreamScreen pieces (R3.9, R3.13 to R3.15, R11.8 to R11.10)", () => {
  it("prefers-reduced-motion: reduce makes the initial mode step and starts no timer", () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) } as unknown as Window)).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) } as unknown as Window)).toBe(false);
    const r = reduceStream(initialStream, { t: "MOUNT", reducedMotion: true });
    expect(r.state.mode).toBe("step");
    expect(r.effects).not.toContain("START_TICKER");
  });
  it("the notice button switches to step and back, and the callout shows the matching button in every mode", () => {
    let s = reduceStream(initialStream, { t: "MOUNT", reducedMotion: false }).state;
    const html = (m: typeof s.mode) => renderToStaticMarkup(<StreamView vm={toStreamVM(input({ mode: m }))} />);
    expect(html(s.mode)).toContain("Switch to step mode");
    s = reduceStream(s, { t: "NOTICE_BUTTON" }).state;
    expect(s.mode).toBe("step");
    expect(html(s.mode)).toContain("Back to playback");
    expect(html("step")).not.toContain("Switch to step mode");
    s = reduceStream(s, { t: "NOTICE_BUTTON" }).state;
    expect(s.mode).toBe("play");
    for (const m of ["play", "paused", "step"] as const) expect(markupText(html(m))).toContain("Flashing content");
    expect(reduceStream(reduceStream(initialStream, { t: "MOUNT", reducedMotion: false }).state, { t: "TOGGLE" }).state.mode).toBe("paused");
    expect(reduceStream({ ...initialStream, mode: "paused" }, { t: "NOTICE_BUTTON" }).state.mode).toBe("step");
  });
  it("Next and Previous move exactly one Packet per activation; Previous is disabled at the oldest held Packet", () => {
    let s = reduceStream(initialStream, { t: "MOUNT", reducedMotion: true }).state;
    expect(canPrev(s)).toBe(false);
    s = reduceStream(s, { t: "NEXT" }).state;
    expect(s.n).toBe(2);
    expect(canPrev(s)).toBe(true);
    s = reduceStream(s, { t: "PREV" }).state;
    expect(s.n).toBe(1);
    expect(reduceStream(s, { t: "PREV" }).state.n).toBe(1);
    const html = renderToStaticMarkup(<StreamView vm={toStreamVM(input({ mode: "step", n: 1, canPrev: false }))} />);
    expect(html).toMatch(/<button class="btn" type="button" disabled=""[^>]*><svg[^>]*><path d="M20 12H5/);
  });
  it("the full-screen caption reads 'Packet {n} of {K} + repair · Lap {L} · {fps} fps'", () => {
    const text = markupText(renderToStaticMarkup(<FullScreenView vm={toFullScreenVM(input({ n: 150, lap: 2, fps: 12 }))} />));
    expect(text).toContain("Packet 150 of 111 + repair · Lap 2 · 12 fps");
  });
  it("Space is ignored on interactive controls", () => {
    const el = (match: boolean) => ({ closest: () => (match ? {} : null) }) as unknown as Element;
    expect(isSpaceTarget(el(true))).toBe(false);
    expect(isSpaceTarget(el(false))).toBe(true);
    expect(isSpaceTarget(null)).toBe(true);
  });
});
