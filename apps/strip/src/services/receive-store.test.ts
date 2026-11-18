import { describe, expect, it } from "vitest";
import type { Clock } from "../clock/index.js";
import { NOTHING_TIMEOUT_MS } from "../limits.js";
import { receiveStore } from "./receive-store.js";
import type { StreamLike } from "./camera.js";
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
const counted = (): { stream: StreamLike; stops: () => number } => {
  let n = 0;
  const tr = { stop: () => void n++ };
  return { stream: { getTracks: () => [tr], getVideoTracks: () => [tr] }, stops: () => n };
};
const start = async (stops: { stream: StreamLike }) => {
  receiveStore.reset();
  const clock = fakeClock();
  receiveStore.setClock(clock);
  receiveStore.setCameraOpener(() => Promise.resolve({ ok: true, stream: stops.stream, torch: false }));
  receiveStore.dispatch({ t: "START" });
  await new Promise((r) => setTimeout(r, 0));
  return clock;
};
describe("camera release and timers in the store (R12.18, R12.19 to R12.22)", () => {
  it("START opens the camera and scans; leaving the route stops every track", async () => {
    const c = counted();
    await start(c);
    expect(receiveStore.getState().phase).toBe("scan");
    receiveStore.leave();
    expect(c.stops()).toBe(1);
    expect(receiveStore.getState().phase).toBe("empty");
    receiveStore.reset();
  });
  it("Stop and completion stop the tracks; a denied camera never opens one", async () => {
    const a = counted();
    await start(a);
    receiveStore.dispatch({ t: "STOP" });
    expect(a.stops()).toBe(1);
    const b = counted();
    await start(b);
    receiveStore.dispatch({ t: "PUSHED", gen: receiveStore.getState().gen, source: "camera", result: { k: "accepted", counters: { solved: 3, total: 3, distinct: 4, complete: true } }, at: 1 });
    expect(b.stops()).toBe(1);
    expect(receiveStore.getState().phase).toBe("done");
    receiveStore.reset();
    receiveStore.setCameraOpener(() => Promise.resolve({ ok: false, name: "NotAllowedError" }));
    receiveStore.dispatch({ t: "START" });
    await new Promise((r) => setTimeout(r, 0));
    expect(receiveStore.getState().phase).toBe("denied");
    receiveStore.reset();
  });
  it("nothing fires after 30 s on the fake clock and Keep scanning restarts the clock", async () => {
    await start(counted());
    const clock = fakeClock();
    receiveStore.setClock(clock);
    receiveStore.dispatch({ t: "CAMERA_OK", torch: false, at: 0 }); // re-arms on the fake clock
    clock.advance(NOTHING_TIMEOUT_MS - 1);
    expect(receiveStore.getState().panel).toBeNull();
    clock.advance(1);
    expect(receiveStore.getState().panel?.kind).toBe("nothing");
    receiveStore.dispatch({ t: "PANEL", action: "primary", at: clock.now() });
    clock.advance(NOTHING_TIMEOUT_MS - 1);
    expect(receiveStore.getState().panel).toBeNull();
    clock.advance(1);
    expect(receiveStore.getState().panel?.kind).toBe("nothing");
    receiveStore.reset();
  });
});
