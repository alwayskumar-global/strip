import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ofCamera } from "../state/disposition.js";
import { openCamera, stopStream, type StreamLike } from "./camera.js";
import { fitCamera, startFrameLoop, type VideoLike } from "./frame-loop.js";
const stream = (counter: { stops: number }): StreamLike => {
  const t = { stop: () => void counter.stops++, getCapabilities: () => ({ torch: true }) };
  return { getTracks: () => [t, { stop: () => void counter.stops++ }], getVideoTracks: () => [t] };
};
describe("camera (R12.16, R12.17, R12.18)", () => {
  it("denied, no-camera and generic failures map to denied, nocam and camera", async () => {
    const fail = (name: string) => openCamera({ getUserMedia: () => Promise.reject(Object.assign(new Error("secret message"), { name })) });
    const expected: Record<string, unknown> = {
      NotAllowedError: { to: "phase", phase: "denied" },
      SecurityError: { to: "phase", phase: "denied" },
      NotFoundError: { to: "phase", phase: "nocam" },
      NotReadableError: { to: "phase", phase: "nocam" },
      OverconstrainedError: { to: "phase", phase: "nocam" },
      AbortError: { to: "phase", phase: "nocam" },
      TypeError: { to: "panel", kind: "camera" },
    };
    for (const [name, d] of Object.entries(expected)) {
      const r = await fail(name);
      expect(r).toEqual({ ok: false, name });
      if (!r.ok) expect(ofCamera(r.name)).toEqual(d);
    }
    const missing = await openCamera(undefined);
    expect(missing).toEqual({ ok: false, name: "API_MISSING" });
    expect(await openCamera({})).toEqual({ ok: false, name: "API_MISSING" });
    expect(ofCamera("API_MISSING")).toEqual({ to: "panel", kind: "camera" });
  });
  it("reports torch capability and stops every track, also when called twice", async () => {
    const c = { stops: 0 };
    const r = await openCamera({ getUserMedia: () => Promise.resolve(stream(c)) });
    expect(r.ok && r.torch).toBe(true);
    if (r.ok) {
      stopStream(r.stream);
      stopStream(r.stream);
    }
    expect(c.stops).toBe(4); // two tracks, stopped twice: each stop is idempotent on a real track
    stopStream(null);
  });
});
describe("Frame_Loop (P30-style drop rules, R12.3, R12.15)", () => {
  it("fitCamera never scales up and fits 1920 x 1080", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8000 }), fc.integer({ min: 1, max: 8000 }), (w, h) => {
        const s = fitCamera(w, h);
        expect(s.width).toBeLessThanOrEqual(Math.max(w, 1));
        expect(s.height).toBeLessThanOrEqual(Math.max(h, 1));
        if (w <= 1920 && h <= 1080) expect([s.width, s.height]).toEqual([w, h]);
        else expect(s.width <= 1921 && s.height <= 1081).toBe(true);
      }),
    );
  });
  it("a frame while the worker is busy creates no bitmap; a bitmap made just before a busy submit is closed; stop cancels", async () => {
    let cb: () => void = () => undefined;
    let cancelled = 0;
    const video: VideoLike = { videoWidth: 640, videoHeight: 480, requestVideoFrameCallback: (f) => ((cb = f), 1), cancelVideoFrameCallback: () => void cancelled++ };
    let idle = true;
    let made = 0;
    let closed = 0;
    const outcomes: string[] = [];
    const loop = startFrameLoop(video, {
      client: { get idle() { return idle; }, submitBitmap: () => ((idle = false), Promise.resolve({ kind: "not_found" as const })) },
      makeBitmap: () => ((made++), Promise.resolve({ close: () => void closed++ } as unknown as ImageBitmap)),
      onOutcome: (o) => outcomes.push(o.kind),
      raf: () => 0,
      cancelRaf: () => undefined,
      visible: () => true,
    });
    idle = false;
    cb();
    expect(made).toBe(0); // busy: no bitmap at all
    idle = true;
    cb();
    idle = false; // the worker becomes busy while the bitmap is being made
    await Promise.resolve();
    await Promise.resolve();
    expect([made, closed, outcomes.length]).toEqual([1, 1, 0]);
    idle = true;
    cb();
    await new Promise((r) => setTimeout(r, 0));
    expect(outcomes).toEqual(["not_found"]);
    loop.stop();
    expect(cancelled).toBe(1);
  });
});
