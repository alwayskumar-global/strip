import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PHOTO_OPTIONS, PHOTO_RETRY_OPTIONS, VIDEO_OPTIONS } from "../src/decode.js";
import { createFrameDecoderWith } from "../src/frame-decoder.js";
import { SymbolError } from "../src/errors.js";
import { fakeBackend } from "./helpers/fake-backend.js";
const frame = (w: number, h: number, fill = 1) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4).fill(fill) });
const make = async (opts: { maxWidth?: number; maxHeight?: number; mode?: "video" | "photo" } = {}) => {
  const fake = fakeBackend();
  const dec = await createFrameDecoderWith(() => Promise.resolve(fake.backend), { maxWidth: 8, maxHeight: 8, wasm: { kind: "url", url: "/x.wasm" }, ...opts });
  return { fake, dec };
};
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
describe("createFrameDecoder", () => {
  it("R7.1: resolves with a decoder after init; an init failure rejects with UNSUPPORTED_ENVIRONMENT", async () => {
    const { dec } = await make();
    expect(dec.busy).toBe(false);
    const fail = createFrameDecoderWith(() => Promise.reject(new SymbolError("UNSUPPORTED_ENVIRONMENT", "no wasm")), { maxWidth: 2, maxHeight: 2 });
    await expect(fail).rejects.toMatchObject({ code: "UNSUPPORTED_ENVIRONMENT" });
    await expect(createFrameDecoderWith(() => Promise.resolve(fakeBackend().backend), { maxWidth: 0, maxHeight: 2 })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(createFrameDecoderWith(() => Promise.resolve(fakeBackend().backend), { maxWidth: 2.5, maxHeight: 2 } as never)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("R7.2, R7.3: video is the default and gets exactly the video options; photo adds invert and retries once on a miss", async () => {
    const v = await make();
    const p1 = v.dec.submit(frame(2, 2));
    expect(v.fake.calls[0]?.options).toEqual(VIDEO_OPTIONS);
    v.fake.resolveNext(undefined);
    expect(await p1).toEqual({ kind: "not_found" });
    expect(v.fake.calls.length).toBe(1);

    const miss = await make({ mode: "photo" });
    const p2 = miss.dec.submit(frame(2, 2));
    expect(miss.fake.calls[0]?.options).toEqual(PHOTO_OPTIONS);
    expect(PHOTO_OPTIONS.tryInvert).toBe(true);
    miss.fake.resolveNext(undefined);
    await tick();
    expect(miss.fake.calls[1]?.options).toEqual(PHOTO_RETRY_OPTIONS);
    expect(PHOTO_RETRY_OPTIONS.binarizer).toBe("GlobalHistogram");
    miss.fake.resolveNext(undefined);
    expect(await p2).toEqual({ kind: "not_found" });
    expect(miss.fake.calls.length).toBe(2);

    const hit = await make({ mode: "photo" });
    const p3 = hit.dec.submit(frame(2, 2));
    hit.fake.resolveNext({ bytes: Uint8Array.of(1, 2, 3) });
    expect((await p3).kind).toBe("found");
    expect(hit.fake.calls.length).toBe(1);
  });
  it("R7.4: a frame larger than the maximum throws INVALID_INPUT, even while busy", async () => {
    const { dec, fake } = await make({ maxWidth: 4, maxHeight: 4 });
    await expect(dec.submit(frame(5, 2))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const p = dec.submit(frame(4, 4));
    await expect(dec.submit(frame(4, 5))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    fake.resolveNext(undefined);
    await p;
  });
  it("R7.10, R7.11: submit while busy resolves dropped, the backend is called once, then the next submit runs", async () => {
    const { dec, fake } = await make();
    const p1 = dec.submit(frame(2, 2));
    expect(dec.busy).toBe(true);
    expect(await dec.submit(frame(2, 2))).toEqual({ kind: "dropped" });
    expect(fake.calls.length).toBe(1);
    fake.resolveNext({ bytes: Uint8Array.of(7) });
    expect((await p1).kind).toBe("found");
    expect(dec.busy).toBe(false);
    const p2 = dec.submit(frame(2, 2));
    expect(fake.calls.length).toBe(2);
    fake.resolveNext(undefined);
    await p2;
  });
  it("R8.3: after dispose, submit throws INVALID_INPUT", async () => {
    const { dec } = await make();
    dec.dispose();
    await expect(dec.submit(frame(2, 2))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("busy is cleared when the backend rejects", async () => {
    const { dec } = await make();
    const boom = createFrameDecoderWith(() => Promise.resolve({ read: () => Promise.reject(new Error("x")) }), { maxWidth: 2, maxHeight: 2 });
    const d = await boom;
    await expect(d.submit(frame(1, 1))).rejects.toThrow("x");
    expect(d.busy).toBe(false);
    expect(dec.busy).toBe(false);
  });
  // Feature: symbols, Property 12: for any sequence of submit calls with a controllable fake backend, at most one backend call is in flight, a call made while one is in flight resolves dropped and never reaches the backend, and after the in-flight decode resolves the next submit runs
  it("P12: model-based single-flight behaviour", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom("submit", "resolve", "resolve-miss"), { minLength: 1, maxLength: 40 }), async (ops) => {
        const { dec, fake } = await make();
        let busy = false;
        let started = 0;
        let pending: Promise<{ kind: string }> | undefined;
        for (const op of ops) {
          if (op === "submit") {
            const p = dec.submit(frame(2, 2));
            if (busy) {
              expect(await p).toEqual({ kind: "dropped" });
              expect(fake.calls.length).toBe(started);
            } else {
              busy = true;
              started++;
              pending = p;
              expect(fake.calls.length).toBe(started);
            }
          } else if (busy) {
            const hit = op === "resolve";
            fake.resolveNext(hit ? { bytes: Uint8Array.of(1) } : undefined);
            expect((await pending)?.kind).toBe(hit ? "found" : "not_found");
            busy = false;
          }
          expect(dec.busy).toBe(busy);
          expect(fake.inFlight).toBe(busy ? 1 : 0);
          expect(fake.maxInFlight).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 100 },
    );
  });
  // Feature: symbols, Property 13: for any sequence of frames up to the maximum size, the staging buffer passed to the backend is the same ArrayBuffer every time, and mutating the caller's buffer after submit returns does not change the decode result
  it("P13: one staging buffer, and the caller may mutate its buffer after submit", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.record({ w: fc.integer({ min: 1, max: 8 }), h: fc.integer({ min: 1, max: 8 }), fill: fc.integer({ min: 0, max: 255 }) }), { minLength: 1, maxLength: 12 }), async (frames) => {
        const { dec, fake } = await make();
        for (const [i, f] of frames.entries()) {
          const input = frame(f.w, f.h, f.fill);
          const p = dec.submit(input);
          input.data.fill(255 - f.fill); // caller reuses its buffer right away
          const call = fake.calls[i];
          expect(call?.buffer).toBe(fake.calls[0]?.buffer);
          expect(call?.snapshot.every((b) => b === f.fill)).toBe(true);
          expect(call?.frame.data.length).toBe(f.w * f.h * 4);
          expect(call?.frame.width).toBe(f.w);
          fake.resolveNext(undefined);
          await p;
        }
      }),
      { numRuns: 100 },
    );
  });
  it("R7.1: the staging buffer has the size of the maximum frame", async () => {
    const { dec, fake } = await make({ maxWidth: 8, maxHeight: 4 });
    const p = dec.submit(frame(2, 2));
    expect((fake.calls[0]?.buffer as ArrayBuffer).byteLength).toBe(8 * 4 * 4);
    fake.resolveNext(undefined);
    await p;
  });
});
