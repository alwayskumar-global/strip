import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { VIDEO_OPTIONS, PHOTO_OPTIONS, PHOTO_RETRY_OPTIONS, decodeFrame, decodeFrameWith } from "../src/decode.js";
import type { DecodeOutcome } from "../src/decode.js";
import type { DecoderBackend } from "../src/decoder-backend.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { compositeImage } from "./helpers/composite.js";
import { fakeBackend } from "./helpers/fake-backend.js";
import { mulberry32, randomBytes } from "./helpers/prng.js";
import { readerWasmBytes } from "./helpers/wasm-bytes.js";
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const tiny = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
const payloadsOf = (n: number, seed: number): Uint8Array[] => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => randomBytes(rng, 12 + i * 5 + Math.floor(rng() * 8)));
};
const setOf = (o: DecodeOutcome): string[] => (o.kind === "found_many" ? o.symbols.map((s) => hex(s.bytes)).sort() : []);
const withBackend = (b: DecoderBackend) => () => Promise.resolve(b);
beforeAll(() => resetBackend());

describe("multi-symbol decoding (R16)", () => {
  it("R16.4, R16.5: composites of 2, 3, 4 and 6 symbols return exactly the placed set, skipped 0", async () => {
    for (const n of [2, 3, 4, 6]) {
      const payloads = payloadsOf(n, n);
      const out = await decodeFrame(compositeImage(payloads), { wasm, maxSymbols: 6 });
      expect(out.kind, `n=${n}`).toBe("found_many");
      expect(setOf(out)).toEqual(payloads.map(hex).sort());
      if (out.kind === "found_many") expect(out.skipped).toBe(0);
    }
  });
  it("R16.4: one symbol with maxSymbols 4 returns found_many with one symbol", async () => {
    const [p] = payloadsOf(1, 99);
    const out = await decodeFrame(compositeImage([p as Uint8Array]), { wasm, maxSymbols: 4 });
    expect(out.kind).toBe("found_many");
    expect(setOf(out)).toEqual([hex(p as Uint8Array)]);
  });
  it("R16.9: the same payload placed twice yields that payload at least once and no other", async () => {
    const [a] = payloadsOf(1, 7);
    const out = await decodeFrame(compositeImage([a as Uint8Array, a as Uint8Array]), { wasm, maxSymbols: 4 });
    const set = new Set(setOf(out));
    expect([...set]).toEqual([hex(a as Uint8Array)]);
    if (out.kind === "found_many") expect(out.symbols.length).toBeGreaterThanOrEqual(1);
  });
  it("R16.6: payloads of 100, 2953, 2954 and 4000 bytes: the first two are symbols, two are skipped, reader order kept", async () => {
    const f = fakeBackend();
    f.setMany([100, 2953, 2954, 4000].map((n) => ({ bytes: new Uint8Array(n).fill(n & 255) })));
    const out = await decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: 4 });
    expect(out.kind).toBe("found_many");
    if (out.kind !== "found_many") return;
    expect(out.symbols.map((s) => s.bytes.length)).toEqual([100, 2953]);
    expect(out.skipped).toBe(2);
  });
  it("R16.7, R5.4: only long payloads give an empty found_many; nothing gives not_found; maxSymbols 1 gives not_strip_packet", async () => {
    const f = fakeBackend();
    f.setMany([{ bytes: new Uint8Array(2954) }, { bytes: new Uint8Array(4000) }]);
    expect(await decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: 3 })).toEqual({ kind: "found_many", symbols: [], skipped: 2 });
    f.setMany([]);
    expect(await decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: 3 })).toEqual({ kind: "not_found" });
    const single: DecoderBackend = { read: () => Promise.resolve({ bytes: new Uint8Array(2954) }), readMany: () => Promise.reject(new Error("unused")) };
    expect(await decodeFrameWith(withBackend(single), tiny, { maxSymbols: 1 })).toEqual({ kind: "not_strip_packet", length: 2954 });
  });
  it("R16.2, R5.1: maxSymbols absent or 1 keeps the single path: one found, read called once with maxNumberOfSymbols 1, readMany never", async () => {
    for (const opts of [{}, { maxSymbols: 1 }]) {
      const reads: number[] = [];
      let many = 0;
      const b: DecoderBackend = {
        read: (_f, o) => (reads.push(o.maxNumberOfSymbols), Promise.resolve({ bytes: Uint8Array.of(1, 2, 3) })),
        readMany: () => (many++, Promise.resolve([])),
      };
      const out = await decodeFrameWith(withBackend(b), tiny, opts);
      expect(out.kind).toBe("found");
      expect(reads).toEqual([1]);
      expect(many).toBe(0);
    }
    const payloads = payloadsOf(4, 11);
    const real = await decodeFrame(compositeImage(payloads), { wasm });
    expect(real.kind).toBe("found");
    if (real.kind === "found") expect(payloads.map(hex)).toContain(hex(real.bytes));
  });
  it("R16.3: maxSymbols 2..16 reach the reader as maxNumberOfSymbols with every other video option unchanged", async () => {
    for (let n = 2; n <= 16; n++) {
      const f = fakeBackend();
      f.setMany([]);
      await decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: n });
      expect(f.manyCalls[0]?.options).toEqual({ ...VIDEO_OPTIONS, maxNumberOfSymbols: n });
    }
  });
  it("R16.1: invalid maxSymbols throws INVALID_INPUT with the backend never called", async () => {
    for (const bad of [0, 17, 1.5, Number.NaN, "4", null, -1, Infinity]) {
      const f = fakeBackend();
      f.setMany([]);
      await expect(decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: bad as never }), String(bad)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(f.manyCalls.length + f.calls.length).toBe(0);
    }
  });
  it("R16.10: photo mode retries with GlobalHistogram only when the first read is empty", async () => {
    const empty = fakeBackend();
    empty.setMany([]);
    expect(await decodeFrameWith(withBackend(empty.backend), tiny, { mode: "photo", maxSymbols: 4 })).toEqual({ kind: "not_found" });
    expect(empty.manyCalls.map((c) => c.options)).toEqual([{ ...PHOTO_OPTIONS, maxNumberOfSymbols: 4 }, { ...PHOTO_RETRY_OPTIONS, maxNumberOfSymbols: 4 }]);
    const longOnly = fakeBackend();
    longOnly.setMany([{ bytes: new Uint8Array(3000) }]);
    await decodeFrameWith(withBackend(longOnly.backend), tiny, { mode: "photo", maxSymbols: 4 });
    expect(longOnly.manyCalls.length).toBe(1);
  });
  it("R16.8: each symbol owns its buffer, and mutating one changes no other symbol or the next decode", async () => {
    const payloads = payloadsOf(3, 5);
    const frame = compositeImage(payloads);
    const out = await decodeFrame(frame, { wasm, maxSymbols: 3 });
    expect(out.kind).toBe("found_many");
    if (out.kind !== "found_many") return;
    const buffers = new Set(out.symbols.map((s) => s.bytes.buffer));
    expect(buffers.size).toBe(out.symbols.length);
    const before = out.symbols.slice(1).map((s) => hex(s.bytes));
    out.symbols[0]?.bytes.fill(0);
    expect(out.symbols.slice(1).map((s) => hex(s.bytes))).toEqual(before);
    expect(setOf(await decodeFrame(frame, { wasm, maxSymbols: 3 }))).toEqual(payloads.map(hex).sort());
  });
});

describe("multi-symbol properties", () => {
  const sets = fc.integer({ min: 1, max: 6 }).chain((n) => fc.uniqueArray(fc.uint8Array({ minLength: 8, maxLength: 60 }), { minLength: n, maxLength: n, selector: hex }));
  // Feature: symbols, Property 27: for any set of 1..6 distinct payloads placed in a clean grid, decodeFrame with maxSymbols 6 returns exactly that set
  it("P27: any set of 1..6 distinct payloads in a clean grid is returned exactly (N = 30)", async () => {
    await fc.assert(
      fc.asyncProperty(sets, async (payloads) => {
        const out = await decodeFrame(compositeImage(payloads), { wasm, maxSymbols: 6 });
        expect(out.kind).toBe("found_many");
        expect(setOf(out)).toEqual(payloads.map(hex).sort());
      }),
      { numRuns: 30, seed: 27 },
    );
  }, 300_000);
  // Feature: symbols, Property 28: for any set of 1..6 payloads and any permutation of their grid positions, the returned set of payloads is the same
  it("P28: the returned set does not depend on the grid positions (N = 30)", async () => {
    await fc.assert(
      fc.asyncProperty(sets.chain((p) => fc.shuffledSubarray(p.map((_, i) => i), { minLength: p.length, maxLength: p.length }).map((order) => ({ p, order }))), async ({ p, order }) => {
        const out = await decodeFrame(compositeImage(p, { order }), { wasm, maxSymbols: 6 });
        expect(setOf(out)).toEqual(p.map(hex).sort());
      }),
      { numRuns: 30, seed: 28 },
    );
  }, 300_000);
  // Feature: symbols, Property 29: for any composite and maxSymbols absent or 1, decodeFrame returns a single found whose bytes equal one of the placed payloads, and the reader gets maxNumberOfSymbols 1 through read
  it("P29: with maxSymbols absent or 1 the result is one found among the placed payloads (N = 20)", async () => {
    await fc.assert(
      fc.asyncProperty(sets, fc.constantFrom(undefined, 1), async (payloads, ms) => {
        const out = await decodeFrame(compositeImage(payloads), ms === undefined ? { wasm } : { wasm, maxSymbols: ms });
        expect(out.kind).toBe("found");
        if (out.kind === "found") expect(payloads.map(hex)).toContain(hex(out.bytes));
      }),
      { numRuns: 20, seed: 29 },
    );
  }, 300_000);
  // Feature: symbols, Property 30: for any value that is not an integer in 1..16, decodeFrame and createFrameDecoder throw SymbolError INVALID_INPUT with the backend call count 0, and every integer in 1..16 is accepted and reaches the reader as maxNumberOfSymbols
  it("P30 (decodeFrame half): invalid maxSymbols never reaches the backend; 1..16 does", async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything().filter((v) => !(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 16) && v !== undefined), async (bad) => {
        const f = fakeBackend();
        f.setMany([]);
        await expect(decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: bad as never })).rejects.toMatchObject({ code: "INVALID_INPUT" });
        expect(f.calls.length + f.manyCalls.length).toBe(0);
      }),
      { numRuns: 100 },
    );
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 16 }), async (n) => {
        const reads: number[] = [];
        const b: DecoderBackend = {
          read: (_f, o) => (reads.push(o.maxNumberOfSymbols), Promise.resolve(undefined)),
          readMany: (_f, o) => (reads.push(o.maxNumberOfSymbols), Promise.resolve([])),
        };
        await decodeFrameWith(withBackend(b), tiny, { maxSymbols: n });
        expect(reads).toEqual([n]);
      }),
      { numRuns: 100 },
    );
  });
  // Feature: symbols, Property 31: for any list of reader payload lengths with maxSymbols above 1, symbols holds the payloads of at most 2953 bytes in reader order, skipped counts the others, and the outcome kind follows the zero-usable rule with no not_strip_packet
  it("P31: partition into symbols and skipped, in reader order, with the zero-usable rule", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 1, max: 3600 }), { maxLength: 16 }), fc.integer({ min: 2, max: 16 }), async (lengths, ms) => {
        const f = fakeBackend();
        f.setMany(lengths.map((n) => ({ bytes: new Uint8Array(n).fill(n & 255) })));
        const out = await decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: ms });
        expect(out.kind).not.toBe("not_strip_packet");
        if (lengths.length === 0) {
          expect(out).toEqual({ kind: "not_found" });
          return;
        }
        expect(out.kind).toBe("found_many");
        if (out.kind !== "found_many") return;
        expect(out.symbols.map((s) => s.bytes.length)).toEqual(lengths.filter((n) => n <= 2953));
        expect(out.skipped).toBe(lengths.filter((n) => n > 2953).length);
      }),
      { numRuns: 100 },
    );
  });
  // Feature: symbols, Property 32: for any reader result list, each FoundSymbol.bytes owns its own ArrayBuffer and changing or transferring one changes no other symbol
  it("P32: every symbol owns its buffer, even when the reader returns views of one buffer", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 1, maxLength: 16 }), async (lengths) => {
        const shared = new Uint8Array(lengths.reduce((a, b) => a + b, 0)).map((_, i) => i & 255);
        let off = 0;
        const f = fakeBackend();
        f.setMany(lengths.map((n) => ((off += n), { bytes: shared.subarray(off - n, off) })));
        const out = await decodeFrameWith(withBackend(f.backend), tiny, { maxSymbols: 16 });
        if (out.kind !== "found_many") throw new Error("expected found_many");
        expect(new Set(out.symbols.map((s) => s.bytes.buffer)).size).toBe(out.symbols.length);
        const snapshot = out.symbols.map((s) => hex(s.bytes));
        out.symbols[0]?.bytes.fill(255);
        expect(out.symbols.slice(1).map((s) => hex(s.bytes))).toEqual(snapshot.slice(1));
      }),
      { numRuns: 100 },
    );
  });
});
