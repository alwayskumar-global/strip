import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { QR_CAPACITY, smallestVersion } from "../src/capacity.js";
import { encodeSymbol, encodeSymbolWith } from "../src/encode-symbol.js";
import type { Encoder } from "../src/encoder.js";
import { SymbolError } from "../src/errors.js";
import { createQrEncoder } from "../src/qr-encoder.js";
import { ECC_LEVELS } from "../src/types.js";
import { ISO_CAPACITY_TABLE } from "./fixtures/iso-capacity.js";
const bytesOf = (n: number, seed = 1): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 131 + seed * 17 + (i >> 3)) & 255);
function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    expect(e).toBeInstanceOf(SymbolError);
    return (e as SymbolError).code;
  }
}
describe("encodeSymbol (R1)", () => {
  it("R1.1, R2.1: 1 byte and 1732 bytes encode; modules.length == size * size and size == 17 + 4 * version", () => {
    for (const n of [1, 1732]) {
      const m = encodeSymbol(bytesOf(n));
      expect(m.size).toBe(17 + 4 * m.version);
      expect(m.modules.length).toBe(m.size * m.size);
      expect(m.ecc).toBe("L");
      expect(m.mask).toBeGreaterThanOrEqual(0);
      expect(m.mask).toBeLessThanOrEqual(7);
    }
    expect(encodeSymbol(bytesOf(1)).version).toBe(1);
    expect(encodeSymbol(bytesOf(1732)).version).toBe(30);
  });
  it("R1.3: default ecc is L, and L, M, Q, H are each accepted", () => {
    expect(encodeSymbol(bytesOf(50)).ecc).toBe("L");
    for (const ecc of ECC_LEVELS) expect(encodeSymbol(bytesOf(50), { ecc }).ecc).toBe(ecc);
  });
  it("R1.5, R1.6: length QR_CAPACITY[ecc] gives version 40, one more throws PACKET_TOO_LARGE", () => {
    for (const ecc of ECC_LEVELS) {
      expect(encodeSymbol(bytesOf(QR_CAPACITY[ecc]), { ecc }).version).toBe(40);
      expect(codeOf(() => encodeSymbol(bytesOf(QR_CAPACITY[ecc] + 1), { ecc }))).toBe("PACKET_TOO_LARGE");
    }
  });
  it("R1.12: an explicit version is honoured, and a packet that does not fit it throws PACKET_TOO_LARGE", () => {
    expect(encodeSymbol(bytesOf(10), { version: 12 }).version).toBe(12);
    expect(encodeSymbol(bytesOf(10), { version: 40, ecc: "H" }).version).toBe(40);
    expect(codeOf(() => encodeSymbol(bytesOf(272), { version: 10 }))).toBe("PACKET_TOO_LARGE");
    expect(encodeSymbol(bytesOf(271), { version: 10 }).version).toBe(10);
  });
  it("R1.14: all 160 cells: exactly the ISO capacity encodes at that version; capacity + 1 throws PACKET_TOO_LARGE", () => {
    let cells = 0;
    for (let v = 1; v <= 40; v++) {
      ECC_LEVELS.forEach((ecc, i) => {
        const cap = ISO_CAPACITY_TABLE[v - 1]?.[i] as number;
        const m = encodeSymbol(bytesOf(cap, v), { ecc, version: v });
        expect(m.version, `v${v} ${ecc}`).toBe(v);
        expect(m.ecc).toBe(ecc);
        expect(codeOf(() => encodeSymbol(bytesOf(cap + 1, v), { ecc, version: v })), `v${v} ${ecc} +1`).toBe("PACKET_TOO_LARGE");
        cells++;
      });
    }
    expect(cells).toBe(160);
  });
  it("R8.4, R1.14: bypassing our check, qr's own overflow surfaces as ENCODE_FAILED", () => {
    const enc = createQrEncoder();
    for (const [version, ecc, cap] of [[10, "L", 271], [30, "L", 1732], [40, "H", 1273]] as const) {
      expect(codeOf(() => enc.encode(bytesOf(cap + 1), ecc, version))).toBe("ENCODE_FAILED");
      expect(enc.encode(bytesOf(cap), ecc, version).version).toBe(version);
    }
  });
  it("R8.3: a non-Uint8Array, an empty array and bad options throw INVALID_INPUT before encoding", () => {
    let calls = 0;
    const spy: Encoder = { encode: () => (calls++, encodeSymbol(bytesOf(1))) };
    for (const v of [null, undefined, "abc", [1, 2, 3], new Uint16Array(3), new Uint8Array(0)]) {
      expect(codeOf(() => encodeSymbolWith(spy, v as unknown as Uint8Array))).toBe("INVALID_INPUT");
    }
    expect(codeOf(() => encodeSymbolWith(spy, bytesOf(3), { ecc: "X" as never }))).toBe("INVALID_INPUT");
    expect(codeOf(() => encodeSymbolWith(spy, bytesOf(3), { version: 41 }))).toBe("INVALID_INPUT");
    expect(calls).toBe(0);
  });
  it("R1.9: identical bytes and options give deep-equal matrices", () => {
    for (const opts of [{}, { ecc: "H" as const }, { ecc: "M" as const, version: 15 }]) {
      expect(encodeSymbol(bytesOf(100, 5), opts)).toEqual(encodeSymbol(bytesOf(100, 5), opts));
    }
  });
  it("R1.13: bytes 0x80..0xFF are not expanded: 300 high bytes encode at the version computed from 300", () => {
    const high = Uint8Array.from({ length: 300 }, (_, i) => 0x80 + (i % 128));
    expect(smallestVersion(300, "L")).toBe(11);
    expect(encodeSymbol(high).version).toBe(11);
    // A UTF-8 text path would need 600 bytes, i.e. a larger version.
    expect(smallestVersion(600, "L")).toBeGreaterThan(11);
  });
  it("R11.6: encodeSymbol works behind the internal Encoder interface with an injected fake", () => {
    const seen: Array<[number, string, number]> = [];
    const fake: Encoder = {
      encode(bytes, ecc, version) {
        seen.push([bytes.length, ecc, version]);
        return { size: 17 + 4 * version, modules: [], version, ecc, mask: 0 };
      },
    };
    const m = encodeSymbolWith(fake, bytesOf(100), { ecc: "Q" });
    expect(seen).toEqual([[100, "Q", smallestVersion(100, "Q") as number]]);
    expect(m.ecc).toBe("Q");
  });
  it("R11.1, R11.2: package.json lists qr as exactly 0.7.2", () => {
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["qr"]).toBe("0.7.2");
  });
});
