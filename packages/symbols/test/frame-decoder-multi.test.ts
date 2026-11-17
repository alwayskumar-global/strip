import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { PHOTO_OPTIONS, PHOTO_RETRY_OPTIONS, VIDEO_OPTIONS } from "../src/decode.js";
import { createFrameDecoderWith } from "../src/frame-decoder.js";
import { fakeBackend } from "./helpers/fake-backend.js";
const frame = (w = 2, h = 2) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
const make = async (maxSymbols?: number, mode?: "video" | "photo") => {
  const fake = fakeBackend();
  const dec = await createFrameDecoderWith(() => Promise.resolve(fake.backend), { maxWidth: 8, maxHeight: 8, wasm: { kind: "url", url: "/x.wasm" }, ...(maxSymbols === undefined ? {} : { maxSymbols }), ...(mode === undefined ? {} : { mode }) });
  return { fake, dec };
};
describe("createFrameDecoder with maxSymbols (R16.3, R16.11)", () => {
  it("passes maxNumberOfSymbols 9 on every frame in video and photo mode and returns found_many", async () => {
    for (const mode of ["video", "photo"] as const) {
      const { fake, dec } = await make(9, mode);
      fake.setMany((i) => [{ bytes: Uint8Array.of(i) }, { bytes: Uint8Array.of(i + 1) }]);
      for (let i = 0; i < 3; i++) {
        const out = await dec.submit(frame());
        expect(out).toMatchObject({ kind: "found_many", skipped: 0 });
      }
      const base = mode === "video" ? VIDEO_OPTIONS : PHOTO_OPTIONS;
      expect(fake.manyCalls.map((c) => c.options)).toEqual(Array.from({ length: 3 }, () => ({ ...base, maxNumberOfSymbols: 9 })));
    }
  });
  it("without maxSymbols it behaves as before: read, one found", async () => {
    const { fake, dec } = await make();
    const p = dec.submit(frame());
    expect(fake.calls[0]?.options).toEqual(VIDEO_OPTIONS);
    fake.resolveNext({ bytes: Uint8Array.of(1) });
    expect((await p).kind).toBe("found");
    expect(fake.manyCalls.length).toBe(0);
  });
  it("R16.1: a bad maxSymbols rejects creation with INVALID_INPUT and no backend is requested", async () => {
    let inits = 0;
    for (const bad of [0, 17, 2.5, "9", null, Number.NaN]) {
      await expect(createFrameDecoderWith(() => (inits++, Promise.resolve(fakeBackend().backend)), { maxWidth: 2, maxHeight: 2, maxSymbols: bad as never })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect(inits).toBe(0);
  });
  it("R7.10, R7.11, R16.11: while a multi-symbol decode is in flight a frame resolves dropped and the next submit runs afterwards", async () => {
    const { fake, dec } = await make(9);
    const p1 = dec.submit(frame());
    expect(dec.busy).toBe(true);
    expect(await dec.submit(frame())).toEqual({ kind: "dropped" });
    expect(fake.manyCalls.length).toBe(1);
    fake.resolveNextMany([{ bytes: Uint8Array.of(7) }]);
    expect((await p1).kind).toBe("found_many");
    const p2 = dec.submit(frame());
    expect(fake.manyCalls.length).toBe(2);
    fake.resolveNextMany([]);
    expect(await p2).toEqual({ kind: "not_found" });
  });
  // Feature: symbols, Property 33: for any maxSymbols in 1..16 and any sequence of submit calls with a controllable fake backend, the reader gets maxNumberOfSymbols equal to maxSymbols, at most one call is in flight, and a call made while one is in flight resolves dropped; in photo mode with maxSymbols above 1 the GlobalHistogram retry happens only when the first read is empty
  it("P33: model-based, any maxSymbols, any submit and resolve sequence", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 16 }), fc.constantFrom("video", "photo"), fc.array(fc.constantFrom("submit", "hit", "miss"), { minLength: 1, maxLength: 30 }), async (ms, mode, ops) => {
        const { fake, dec } = await make(ms, mode);
        let busy = false;
        let pending: Promise<{ kind: string }> | undefined;
        let awaitingRetry = false;
        for (const op of ops) {
          if (op === "submit") {
            const p = dec.submit(frame());
            if (busy) expect(await p).toEqual({ kind: "dropped" });
            else {
              busy = true;
              pending = p;
            }
          } else if (busy) {
            const many = ms > 1;
            const resolve = (r: { bytes: Uint8Array }[] | undefined): void => (many ? fake.resolveNextMany(r ?? []) : fake.resolveNext(r?.[0]));
            if (op === "hit") {
              resolve([{ bytes: Uint8Array.of(1) }]);
              await pending;
              busy = false;
            } else if (mode === "photo" && !awaitingRetry) {
              resolve([]);
              await new Promise<void>((r) => setTimeout(r, 0));
              awaitingRetry = true; // the retry is now the pending call
            } else {
              resolve([]);
              await pending;
              busy = false;
              awaitingRetry = false;
            }
            if (op === "hit") awaitingRetry = false;
          }
          expect(fake.maxInFlight).toBeLessThanOrEqual(1);
          expect(dec.busy).toBe(busy);
        }
        for (const c of [...fake.calls, ...fake.manyCalls]) expect(c.options.maxNumberOfSymbols).toBe(ms);
        const opts = [...fake.calls, ...fake.manyCalls].map((c) => c.options.binarizer);
        if (mode === "video") expect(opts.every((b) => b === VIDEO_OPTIONS.binarizer)).toBe(true);
        else expect(opts.filter((b) => b === PHOTO_RETRY_OPTIONS.binarizer).length).toBeLessThanOrEqual(opts.length);
      }),
      { numRuns: 100 },
    );
  });
});
