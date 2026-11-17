import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { encode } from "@strip/codec";
import { QR_CAPACITY } from "../src/capacity.js";
import { decodeFrame, decodeFrameWith } from "../src/decode.js";
import type { DecoderBackend } from "../src/decoder-backend.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { SYMBOL_ERROR_CODES, SymbolError } from "../src/errors.js";
import { fitScale } from "../src/fit-scale.js";
import { renderToCanvas } from "../src/render-canvas.js";
import { renderToSvg } from "../src/render-svg.js";
import { ECC_LEVELS } from "../src/types.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { fakeCanvas } from "./helpers/fake-canvas.js";
import { matrixToImageData } from "./helpers/matrix-to-image.js";
import { readerWasmBytes } from "./helpers/wasm-bytes.js";
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
beforeAll(() => resetBackend());
const noop: DecoderBackend = { read: () => Promise.resolve(undefined) };

describe("decode properties", () => {
  // Feature: symbols, Property 1: for any byte array of 1..QR_CAPACITY[ecc] bytes and each ecc, encode, rasterise at 4 ppm, decode with the zxing backend returns identical bytes
  for (const ecc of ECC_LEVELS) {
    it(`P1: encode, rasterise, decode returns identical bytes (ecc ${ecc}, N = 100)`, async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: QR_CAPACITY[ecc] }).chain((n) => fc.uint8Array({ minLength: n, maxLength: n })),
          async (bytes) => {
            const r = await decodeFrame(matrixToImageData(encodeSymbol(bytes, { ecc }), 4, 4), { wasm });
            expect(r.kind).toBe("found");
            if (r.kind === "found") expect(r.bytes).toEqual(bytes);
          },
        ),
        { numRuns: 100, seed: 20260101 },
      );
    }, 600_000);
  }
  // Feature: symbols, Property 9: for blank frames of any size and uniform colour and for seeded noise frames, decodeFrame resolves not_found and never throws
  it("P9: blank and noise frames resolve not_found", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 120 }), fc.integer({ min: 1, max: 120 }), fc.integer({ min: 0, max: 255 }), fc.integer({ min: 0, max: 2 ** 31 - 1 }), fc.boolean(), async (w, h, colour, seed, noise) => {
        const data = new Uint8ClampedArray(w * h * 4);
        let s = seed | 1;
        for (let i = 0; i < data.length; i++) {
          if (noise) {
            s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
            data[i] = (s >>> 0) & 255;
          } else data[i] = i % 4 === 3 ? 255 : colour;
        }
        expect(await decodeFrame({ width: w, height: h, data }, { wasm })).toEqual({ kind: "not_found" });
      }),
      { numRuns: 100 },
    );
  }, 120_000);
  // Feature: symbols, Property 10: for any frame-like value with a wrong type, non-integer or non-positive size, wrong data type or wrong data length, decodeFrame throws SymbolError INVALID_INPUT before the backend is called
  it("P10: malformed frames throw INVALID_INPUT before the backend is called", async () => {
    let calls = 0;
    const provider = () => (calls++, Promise.resolve(noop));
    const badFrame = fc.oneof(
      fc.constantFrom(null, undefined, 0, "frame", [], true),
      fc.record({ width: fc.oneof(fc.double({ noInteger: true }), fc.integer({ max: 0 }), fc.string(), fc.constant(undefined)), height: fc.integer({ min: 1, max: 5 }), data: fc.constant(new Uint8ClampedArray(20)) }),
      fc.record({ width: fc.integer({ min: 1, max: 5 }), height: fc.integer({ min: 1, max: 5 }), data: fc.oneof(fc.uint8Array(), fc.array(fc.integer()), fc.constant(null)) }),
      fc.record({ width: fc.integer({ min: 1, max: 5 }), height: fc.integer({ min: 1, max: 5 }), data: fc.uint8Array({ minLength: 0, maxLength: 200 }).map((a) => new Uint8ClampedArray(a)) }).filter((f) => f.data.length !== f.width * f.height * 4),
    );
    await fc.assert(
      fc.asyncProperty(badFrame, async (f) => {
        await expect(decodeFrameWith(provider, f as never, {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
      }),
      { numRuns: 100 },
    );
    expect(calls).toBe(0);
  });
  // Feature: symbols, Property 11: for any invalid input to any public function, the thrown error is a SymbolError whose code is in SYMBOL_ERROR_CODES; a wasm load failure gives UNSUPPORTED_ENVIRONMENT; a missing wasm source gives INVALID_INPUT
  it("P11: invalid input to any public function throws a SymbolError from the closed set", async () => {
    const m = encodeSymbol(new Uint8Array([1, 2, 3]));
    const check = (fn: () => unknown): void => {
      try {
        fn();
      } catch (e) {
        expect(e).toBeInstanceOf(SymbolError);
        expect(SYMBOL_ERROR_CODES).toContain((e as SymbolError).code);
      }
    };
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (a, b) => {
        check(() => encodeSymbol(a as never, b as never));
        check(() => renderToCanvas(a as never, m, b as never));
        check(() => renderToCanvas(fakeCanvas().ctx, a as never, b as never));
        check(() => renderToSvg(a as never, b as never));
        check(() => renderToSvg(m, a as never));
        check(() => fitScale(a as never, b as never, a as never));
      }),
      { numRuns: 200 },
    );
    await fc.assert(
      fc.asyncProperty(fc.anything(), fc.anything(), async (a, b) => {
        await decodeFrameWith(() => Promise.resolve(noop), a as never, b as never).catch((e: unknown) => {
          expect(e).toBeInstanceOf(SymbolError);
          expect(SYMBOL_ERROR_CODES).toContain((e as SymbolError).code);
        });
      }),
      { numRuns: 200 },
    );
    resetBackend();
    const frame = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    await expect(decodeFrame(frame, {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(decodeFrame(frame, { wasm: { kind: "bytes", bytes: new Uint8Array([9, 9, 9, 9]) } })).rejects.toMatchObject({ code: "UNSUPPORTED_ENVIRONMENT" });
    expect(typeof encode).toBe("function");
  });
});
