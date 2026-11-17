import { describe, expect, it } from "vitest";
import { SymbolError } from "../src/errors.js";
import {
  assertBytes,
  assertDecodeOptions,
  assertEncodeOptions,
  assertImageDataLike,
  assertRenderOptions,
} from "../src/validate.js";
function code(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    expect(e).toBeInstanceOf(SymbolError);
    return (e as SymbolError).code;
  }
}
const frame = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
describe("validators (R8.3, R5.5)", () => {
  it("assertBytes", () => {
    expect(code(() => assertBytes(new Uint8Array(1)))).toBeUndefined();
    for (const v of [null, undefined, "abc", [1, 2], new Uint8Array(0), new Uint16Array(2), new ArrayBuffer(4), 5]) {
      expect(code(() => assertBytes(v)), String(v)).toBe("INVALID_INPUT");
    }
  });
  it("assertImageDataLike accepts a valid frame and rejects every malformed one", () => {
    expect(code(() => assertImageDataLike(frame(2, 3)))).toBeUndefined();
    const bads: unknown[] = [
      null, undefined, 5, "x", {},
      { ...frame(2, 2), width: 1.5 }, { ...frame(2, 2), width: 0 }, { ...frame(2, 2), height: -1 },
      { ...frame(2, 2), width: Number.NaN }, { ...frame(2, 2), height: Infinity },
      { ...frame(2, 2), width: "2" },
      { ...frame(2, 2), data: new Uint8Array(16) }, { ...frame(2, 2), data: [0, 0, 0, 0] },
      { ...frame(2, 2), data: new Uint8ClampedArray(15) }, { ...frame(2, 2), data: new Uint8ClampedArray(17) },
    ];
    for (const v of bads) expect(code(() => assertImageDataLike(v)), JSON.stringify(v)).toBe("INVALID_INPUT");
  });
  it("assertEncodeOptions", () => {
    expect(code(() => assertEncodeOptions(undefined))).toBeUndefined();
    expect(code(() => assertEncodeOptions({}))).toBeUndefined();
    for (const ecc of ["L", "M", "Q", "H"]) expect(code(() => assertEncodeOptions({ ecc }))).toBeUndefined();
    for (const version of [1, 40]) expect(code(() => assertEncodeOptions({ version }))).toBeUndefined();
    for (const v of [null, 5, "L", { ecc: "l" }, { ecc: "X" }, { ecc: 1 }, { version: 0 }, { version: 41 }, { version: 1.5 }, { version: "3" }]) {
      expect(code(() => assertEncodeOptions(v)), JSON.stringify(v)).toBe("INVALID_INPUT");
    }
  });
  it("assertRenderOptions", () => {
    expect(code(() => assertRenderOptions({ ppm: 1 }))).toBeUndefined();
    expect(code(() => assertRenderOptions({ ppm: 4, quietZone: 4, dark: "#000", light: "white", mm: 30 }))).toBeUndefined();
    for (const v of [
      null, {}, { ppm: 0 }, { ppm: 1.5 }, { ppm: -2 }, { ppm: Number.NaN }, { ppm: "4" },
      { ppm: 4, quietZone: -1 }, { ppm: 4, quietZone: 2.5 }, { ppm: 4, dark: "url(#x)" }, { ppm: 4, light: 5 },
      { ppm: 4, dark: "#000\" onload=\"x" }, { ppm: 4, mm: 0 }, { ppm: 4, mm: -1 }, { ppm: 4, mm: Infinity }, { ppm: 4, allowShortQuietZone: "yes" },
    ]) {
      expect(code(() => assertRenderOptions(v)), JSON.stringify(v)).toBe("INVALID_INPUT");
    }
  });
  it("R2.3: quiet zone 3 without allowShortQuietZone throws, with it passes", () => {
    expect(code(() => assertRenderOptions({ ppm: 4, quietZone: 3 }))).toBe("INVALID_INPUT");
    expect(code(() => assertRenderOptions({ ppm: 4, quietZone: 0 }))).toBe("INVALID_INPUT");
    expect(code(() => assertRenderOptions({ ppm: 4, quietZone: 3, allowShortQuietZone: true }))).toBeUndefined();
    expect(code(() => assertRenderOptions({ ppm: 4, quietZone: 4 }))).toBeUndefined();
  });
  it("assertDecodeOptions", () => {
    expect(code(() => assertDecodeOptions({}))).toBeUndefined();
    expect(code(() => assertDecodeOptions({ mode: "video", wasm: { kind: "url", url: "/a.wasm" } }))).toBeUndefined();
    expect(code(() => assertDecodeOptions({ mode: "photo", wasm: { kind: "bytes", bytes: new Uint8Array(3) } }))).toBeUndefined();
    expect(code(() => assertDecodeOptions({ wasm: { kind: "bytes", bytes: new ArrayBuffer(3) } }))).toBeUndefined();
    for (const v of [
      null, 5, { mode: "fast" }, { wasm: 5 }, { wasm: {} }, { wasm: { kind: "url" } }, { wasm: { kind: "url", url: "" } },
      { wasm: { kind: "bytes", bytes: [1] } }, { wasm: { kind: "bytes", bytes: new Uint8Array(0) } }, { wasm: { kind: "cdn", url: "x" } },
    ]) {
      expect(code(() => assertDecodeOptions(v)), JSON.stringify(v)).toBe("INVALID_INPUT");
    }
  });
});
