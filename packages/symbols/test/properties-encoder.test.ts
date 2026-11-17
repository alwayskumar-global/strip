import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { QR_CAPACITY } from "../src/capacity.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { SymbolError } from "../src/errors.js";
import { ECC_LEVELS } from "../src/types.js";
import type { EccLevel } from "../src/types.js";
import { ISO_CAPACITY_TABLE } from "./fixtures/iso-capacity.js";
import { flipped, structureViolations } from "./helpers/matrix-structure.js";
const eccArb = fc.constantFrom<EccLevel>(...ECC_LEVELS);
const isoCap = (v: number, e: EccLevel): number => ISO_CAPACITY_TABLE[v - 1]?.[ECC_LEVELS.indexOf(e)] as number;
const isoSmallest = (len: number, e: EccLevel): number => {
  for (let v = 1; v <= 40; v++) if (isoCap(v, e) >= len) return v;
  throw new Error("no version");
};
const FC = { numRuns: 100 } as const;
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return e instanceof SymbolError ? e.code : "other";
  }
};
const packet = (ecc: EccLevel) =>
  fc.integer({ min: 1, max: QR_CAPACITY[ecc] }).chain((n) => fc.uint8Array({ minLength: n, maxLength: n }));
const bytes = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255);

describe("structure helper self-check", () => {
  it("accepts good symbols and rejects corrupted ones", () => {
    for (const [v, e] of [[1, "L"], [7, "M"], [30, "L"], [40, "H"]] as const) {
      const m = encodeSymbol(bytes(5), { version: v, ecc: e });
      expect(structureViolations(m)).toEqual([]);
      const n = m.size;
      expect(structureViolations(flipped(m, 3, 3)).length, "finder").toBeGreaterThan(0);
      expect(structureViolations(flipped(m, 10, 6)).length, "timing row").toBeGreaterThan(0);
      expect(structureViolations(flipped(m, 8, n - 8)).length, "dark module").toBeGreaterThan(0);
      expect(structureViolations(flipped(m, 8, 2)).length, "format copy 1").toBeGreaterThan(0);
      expect(structureViolations(flipped(m, n - 3, 8)).length, "format copy 2").toBeGreaterThan(0);
      expect(structureViolations(flipped(m, 7, 0)).length, "separator").toBeGreaterThan(0);
      if (v >= 7) {
        expect(structureViolations(flipped(m, n - 11, 0)).length, "version A").toBeGreaterThan(0);
        expect(structureViolations(flipped(m, 0, n - 11)).length, "version B").toBeGreaterThan(0);
      }
    }
  });
});

describe("encoder properties", () => {
  // Feature: symbols, Property 2: for any bytes and options, two encodeSymbol calls return deep-equal matrices with the same mask
  it("P2: determinism", () => {
    fc.assert(
      fc.property(eccArb, fc.boolean(), fc.integer({ min: 1, max: 40 }), fc.uint8Array({ minLength: 1, maxLength: 200 }), (ecc, useV, v, b) => {
        const opts = useV ? { ecc, version: v } : { ecc };
        const a = encodeSymbol(b, opts);
        const c = encodeSymbol(b, opts);
        expect(c).toEqual(a);
        expect(c.mask).toBe(a.mask);
      }),
      FC,
    );
  });
  // Feature: symbols, Property 3: for any encoded matrix, size and length match 17 + 4 * version and finder, separators, timing, dark module, format and version information match the spec
  it("P3: matrix invariants for random inputs", () => {
    fc.assert(
      fc.property(eccArb, fc.integer({ min: 1, max: 40 }), fc.integer({ min: 1, max: 4000 }), fc.integer({ min: 0, max: 255 }), (ecc, v, n, seed) => {
        const len = Math.max(1, Math.min(n, isoCap(v, ecc)));
        const b = Uint8Array.from({ length: len }, (_, i) => (i * 131 + seed) & 255);
        const m = encodeSymbol(b, { ecc, version: v });
        expect(m.version).toBe(v);
        expect(structureViolations(m)).toEqual([]);
      }),
      FC,
    );
  });
  it("R14.4: width including a 4-module Quiet_Zone is 17 + 4v + 8 for every version (580 px at v30, 740 px at v40, 4 ppm)", () => {
    for (let v = 1; v <= 40; v++) expect(encodeSymbol(bytes(1), { version: v }).size + 8).toBe(25 + 4 * v);
    expect((25 + 4 * 30) * 4).toBe(580);
    expect((25 + 4 * 40) * 4).toBe(740);
  });
  // Feature: symbols, Property 4: for any ecc and version, a payload of the ISO capacity encodes at exactly that version and one byte more throws PACKET_TOO_LARGE; with no version, QR_CAPACITY bytes gives version 40 and one more throws
  it("P4: capacity boundary", () => {
    fc.assert(
      fc.property(eccArb, fc.integer({ min: 1, max: 40 }), (ecc, v) => {
        const cap = isoCap(v, ecc);
        expect(encodeSymbol(bytes(cap), { ecc, version: v }).version).toBe(v);
        expect(codeOf(() => encodeSymbol(bytes(cap + 1), { ecc, version: v }))).toBe("PACKET_TOO_LARGE");
        expect(encodeSymbol(bytes(QR_CAPACITY[ecc]), { ecc }).version).toBe(40);
        expect(codeOf(() => encodeSymbol(bytes(QR_CAPACITY[ecc] + 1), { ecc }))).toBe("PACKET_TOO_LARGE");
      }),
      FC,
    );
  });
  // Feature: symbols, Property 5: for any length and ecc with no version option, the matrix version equals the smallest version whose table capacity is at least the length
  it("P5: smallest version", () => {
    fc.assert(
      fc.property(eccArb, fc.integer({ min: 1, max: 2953 }), (ecc, n) => {
        const len = Math.min(n, QR_CAPACITY[ecc]);
        expect(encodeSymbol(bytes(len), { ecc }).version).toBe(isoSmallest(len, ecc));
      }),
      FC,
    );
  });
  it("P3 with arbitrary packets: random content at random lengths still passes the structure checks", () => {
    fc.assert(
      fc.property(eccArb.chain((e) => packet(e).map((b) => [e, b] as const)), ([ecc, b]) => {
        expect(structureViolations(encodeSymbol(b, { ecc }))).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });
});
