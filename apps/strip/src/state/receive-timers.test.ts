import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { NOTHING_TIMEOUT_MS, STALL_TIMEOUT_MS } from "../limits.js";
import { initialReceive, reduceReceive, type ReceiveEvent, type ReceiveState } from "./receive.js";
import { nextDeadline, verdict } from "./receive-timers.js";
const ok = { solved: 1, total: 10, distinct: 1, complete: false };
type Step = { kind: "found"; dt: number } | { kind: "accept"; dt: number; grew: boolean } | { kind: "tick"; dt: number };
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant("found" as const), dt: fc.integer({ min: 0, max: 40_000 }) }),
  fc.record({ kind: fc.constant("accept" as const), dt: fc.integer({ min: 0, max: 40_000 }), grew: fc.boolean() }),
  fc.record({ kind: fc.constant("tick" as const), dt: fc.integer({ min: 0, max: 40_000 }) }),
);
describe("receive timers (P22, R12.19 to R12.21)", () => {
  // Feature: unit (P22): stall only after a first accepted Packet and 20 s without a new solved block; nothing only after 30 s without found; stall wins
  it("P22: on a fake clock the verdicts fire exactly by the rules and stall wins when both hold", () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        let s: ReceiveState = reduceReceive({ ...initialReceive, phase: "ask", cameraPending: true }, { t: "CAMERA_OK", torch: false, at: 0 }).state;
        let now = 0;
        let solved = 0;
        let model = { first: undefined as number | undefined, lastSolved: undefined as number | undefined, lastFound: 0 };
        for (const st of steps) {
          now += st.dt;
          let ev: ReceiveEvent;
          if (st.kind === "found") {
            model.lastFound = now;
            ev = { t: "FOUND", at: now };
          } else if (st.kind === "accept") {
            if (st.grew) solved++;
            if (model.first === undefined) model = { ...model, first: now, lastSolved: now };
            else if (st.grew) model.lastSolved = now;
            ev = { t: "PUSHED", gen: s.gen, source: "camera", result: { k: "accepted", counters: { ...ok, solved } }, at: now };
          } else {
            const stall = model.first !== undefined && now - (model.lastSolved as number) >= STALL_TIMEOUT_MS;
            const nothing = now - model.lastFound >= NOTHING_TIMEOUT_MS;
            const want = stall ? "stall" : nothing ? "nothing" : null;
            expect(verdict(s.t, now, true)).toBe(want);
            const before = s;
            s = reduceReceive(s, { t: "TIMER", at: now }).state;
            if (want === null || before.panel) expect(s.panel?.kind ?? null).toBe(before.panel?.kind ?? null);
            else expect(s.panel?.kind).toBe(want);
            if (s.panel) s = { ...s, panel: null };
            continue;
          }
          s = reduceReceive(s, ev).state;
          if (s.phase === "done") break;
        }
      }),
      { numRuns: 150 },
    );
  });
  it("no stall without a first accepted Packet, however long; nothing needs the camera on", () => {
    expect(verdict({ cameraStartedAt: 0 }, STALL_TIMEOUT_MS + 5, true)).toBeNull();
    expect(verdict({ cameraStartedAt: 0 }, NOTHING_TIMEOUT_MS, true)).toBe("nothing");
    expect(verdict({ cameraStartedAt: 0 }, NOTHING_TIMEOUT_MS * 9, false)).toBeNull();
    expect(verdict({ cameraStartedAt: 0, lastFoundAt: 0, firstAcceptedAt: 0, lastSolvedAt: 0 }, 100_000, true)).toBe("stall");
    expect(nextDeadline({})).toBeNull();
    expect(nextDeadline({ cameraStartedAt: 100 })).toBe(100 + NOTHING_TIMEOUT_MS);
    expect(nextDeadline({ cameraStartedAt: 0, firstAcceptedAt: 5, lastSolvedAt: 5 })).toBe(5 + STALL_TIMEOUT_MS);
  });
  it("Keep scanning restarts both clocks; Start over resets counters and clocks; Stop releases the camera", () => {
    let s: ReceiveState = reduceReceive({ ...initialReceive, phase: "ask", cameraPending: true }, { t: "CAMERA_OK", torch: false, at: 0 }).state;
    s = reduceReceive(s, { t: "PUSHED", gen: s.gen, source: "camera", result: { k: "accepted", counters: ok }, at: 1000 }).state;
    s = reduceReceive(s, { t: "TIMER", at: 21_000 }).state;
    expect(s.panel?.kind).toBe("stall");
    const keep = reduceReceive(s, { t: "PANEL", action: "primary", at: 22_000 }).state;
    expect(keep.panel).toBeNull();
    expect(verdict(keep.t, 22_000 + STALL_TIMEOUT_MS - 1, true)).toBeNull();
    const over = reduceReceive({ ...keep, phase: "scan" }, { t: "START_OVER" });
    expect(over.state.counters).toEqual({ seen: 0, skipped: 0, solved: 0, total: 0, distinct: 0, complete: false });
    expect(over.state.t).toEqual({});
    expect(over.effects).toContain("NEW_SESSION");
    expect(reduceReceive({ ...keep, phase: "scan" }, { t: "STOP" }).effects).toContain("STOP_CAMERA");
  });
});
