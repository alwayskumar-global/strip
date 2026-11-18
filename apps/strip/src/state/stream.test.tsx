import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Clock } from "../clock/index.js";
import { createStreamPlayer, createTicker } from "../services/stream-player.js";
import { STEP_HISTORY } from "../limits.js";
import { canPrev, initialStream, lapOf, reduceStream, type StreamEvent, type StreamUi } from "./stream.js";
import { toStreamVM } from "../views/stream-vm.js";
import { renderToStaticMarkup } from "react-dom/server";
import { StreamView } from "../views/StreamView.js";
import { encodeSymbol } from "@strip/symbols";
import { markupText } from "../views/board-copy.test-support.js";
const fakeClock = (): Clock & { advance(ms: number): void } => {
  let t = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => t,
    setTimeout: (fn, ms) => (timers.set(next, { at: t + ms, fn }), next++),
    clearTimeout: (id) => void timers.delete(id),
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    },
  };
};
const evArb: fc.Arbitrary<StreamEvent> = fc.oneof(
  fc.constantFrom<StreamEvent>({ t: "TOGGLE" }, { t: "NOTICE_BUTTON" }, { t: "TICK" }, { t: "NEXT" }, { t: "PREV" }, { t: "HIDDEN" }),
  fc.integer({ min: -5, max: 40 }).map((value) => ({ t: "FPS", value }) as StreamEvent),
);
describe("stream reducer and player (P13, P14, P16)", () => {
  // Feature: unit (P13): next() yields 0, 1, 2, ... none skipped or repeated; the shown number equals a model; no illegal transition
  it("P13: for any event sequence the encoder is called in order, the shown Packet matches the model, and play never steps", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.array(evArb, { maxLength: 400 }), (reduced, events) => {
        let calls = 0;
        const player = createStreamPlayer({ next: () => Uint8Array.of(calls++ & 255, (calls - 1) >> 8) }, STEP_HISTORY);
        let s: StreamUi = initialStream;
        const run = (ev: StreamEvent): void => {
          const before = s;
          const r = reduceStream(s, ev);
          s = r.state;
          if (ev.t === "MOUNT") player.start();
          else if (r.effects.includes("SHOW")) {
            if (s.n === before.n + 1) player.advance();
            else if (s.n === before.n - 1) expect(player.back()).not.toBeNull();
          }
          if (before.mode === "play" && (ev.t === "NEXT" || ev.t === "PREV")) expect(s).toBe(before);
          expect(["play", "paused", "step"]).toContain(s.mode);
          expect(player.shown + 1).toBe(s.n);
          expect(player.produced).toBe(s.produced);
          expect(canPrev(s)).toBe(player.canPrev);
        };
        run({ t: "MOUNT", reducedMotion: reduced });
        for (const ev of events) run(ev);
        // next() was called exactly produced times, with sequence numbers 0, 1, 2, ... (the fake encoder counts its own calls)
        expect(calls).toBe(s.produced);
      }),
      { numRuns: 120 },
    );
  });
  it("Previous is bounded by STEP_HISTORY: after 300 advances only 255 steps back are possible", () => {
    let s = reduceStream(initialStream, { t: "MOUNT", reducedMotion: true }).state;
    const player = createStreamPlayer({ next: () => new Uint8Array(1) });
    player.start();
    for (let i = 0; i < 300; i++) {
      s = reduceStream(s, { t: "NEXT" }).state;
      player.advance();
    }
    let back = 0;
    while (canPrev(s)) {
      s = reduceStream(s, { t: "PREV" }).state;
      expect(player.back()).not.toBeNull();
      back++;
    }
    expect(back).toBe(STEP_HISTORY - 1);
    expect(player.back()).toBeNull();
    expect(player.canPrev).toBe(false);
  });
  // Feature: unit (P14): for any fps 2 to 15, 10 s of play shows 10 x fps Packets within 1; an fps change applies from the next tick; no global time
  it("P14: 10 s of play on a fake clock shows 10 x fps Packets (within 1); a changed fps applies from the next tick", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 15 }), (fps) => {
        const clock = fakeClock();
        let ticks = 0;
        const tk = createTicker(clock, () => void ticks++);
        tk.start(fps);
        clock.advance(10_000);
        expect(Math.abs(ticks - 10 * fps)).toBeLessThanOrEqual(1);
        tk.stop();
        clock.advance(5000);
        expect(Math.abs(ticks - 10 * fps)).toBeLessThanOrEqual(1);
      }),
    );
    const clock = fakeClock();
    let ticks = 0;
    const tk = createTicker(clock, () => void ticks++);
    tk.start(2);
    clock.advance(1000); // 2 ticks at 500 ms
    tk.setFps(10);
    clock.advance(5000); // the tick due at 1500 uses the old deadline, then 100 ms apart
    expect(ticks).toBe(2 + 1 + 45); // 500, 1000, then 1500 (old interval), then every 100 ms to 6000
  });
  it("the player reads no global time: with throwing Date and performance the player and reducer still run", () => {
    const realDate = globalThis.Date;
    const realPerf = globalThis.performance;
    Object.defineProperty(globalThis, "Date", { value: new Proxy(realDate, { get() { throw new Error("Date read"); }, construct() { throw new Error("Date read"); } }), configurable: true });
    Object.defineProperty(globalThis, "performance", { value: { now: () => { throw new Error("performance read"); } }, configurable: true });
    try {
      const p = createStreamPlayer({ next: () => new Uint8Array(1) });
      p.start();
      p.advance();
      p.back();
      reduceStream(reduceStream(initialStream, { t: "MOUNT", reducedMotion: false }).state, { t: "TICK" });
    } finally {
      Object.defineProperty(globalThis, "Date", { value: realDate, configurable: true });
      Object.defineProperty(globalThis, "performance", { value: realPerf, configurable: true });
    }
  });
  // Feature: unit (P16): counter text, lap, progress value and aria labels match the formulas
  it("P16: counter, lap floor((n - 1) / T) + 1, progress min(n, K) and the aria labels follow the formulas", () => {
    const matrix = encodeSymbol(Uint8Array.from({ length: 1700 }, (_, i) => i & 255), { version: 30, ecc: "L" });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 900 }), fc.integer({ min: 1, max: 255 }), fc.integer({ min: 0, max: 200 }), (n, K, extra) => {
        const T = K + extra;
        const vm = toStreamVM({ mode: "play", n, k: K, t: T, lap: lapOf(n, T), fps: 8, fileTag: "f", matrix } as never);
        const html = renderToStaticMarkup(<StreamView vm={vm} />);
        expect(lapOf(n, T)).toBe(Math.floor((n - 1) / T) + 1);
        expect(markupText(html)).toContain(`Lap ${lapOf(n, T)}`);
        expect(html).toContain(`<progress class="progress" value="${Math.min(n, K)}" max="${K}"`);
        expect(html).toContain(`aria-label="Animated code, frame ${n}"`);
        expect(html).toContain(`aria-label="Animated data code, packet ${n} of ${K}"`);
        expect(html).toContain(`<span class="counter__n">${n}</span>`);
      }),
      { numRuns: 80 },
    );
  });
  it("MOUNT with reduced motion starts in step with no ticker; otherwise play with a ticker", () => {
    const r = reduceStream(initialStream, { t: "MOUNT", reducedMotion: true });
    expect([r.state.mode, r.effects.includes("START_TICKER")]).toEqual(["step", false]);
    const p = reduceStream(initialStream, { t: "MOUNT", reducedMotion: false });
    expect([p.state.mode, p.effects.includes("START_TICKER")]).toEqual(["play", true]);
  });
});
