import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DENSE_PERIOD } from "../src/constants.js";
import { isDense, Neighbors } from "../src/neighbors.js";
import { getSolitonTable } from "../src/soliton.js";

describe("Property 10", () => {
  // Feature: codec, Property 10: neighbors are pure, distinct and in range
  // Validates: Requirements 2.3, 2.4, 6.2
  it("Feature: codec, Property 10: neighbors are pure, distinct and in range", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.integer({ min: 1, max: 3000 }),
        fc.oneof(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 200 }), fc.integer({ min: 4294967200, max: 4294967295 })),
        fc.integer({ min: 0, max: 200 }),
        (session, K, rawSeq, offset) => {
          const seq = rawSeq < 200 ? Math.min(0xffffffff, K + (rawSeq % 3 === 0 ? offset : rawSeq - 100 < 0 ? rawSeq : rawSeq)) : rawSeq;
          const table = getSolitonTable(K);
          const a = new Neighbors(K, table, DENSE_PERIOD);
          const b = new Neighbors(K, table, DENSE_PERIOD);
          const outA = new Uint32Array(K);
          const outB = new Uint32Array(K);
          const outC = new Uint32Array(K);
          const n1 = a.select(session, seq, outA);
          const n2 = b.select(session, seq, outB);
          expect(n2).toBe(n1);
          expect(Array.from(outB.subarray(0, n2))).toEqual(Array.from(outA.subarray(0, n1)));
          const n3 = a.select(session, seq, outC); // reused scratch gives the same set again
          expect(Array.from(outC.subarray(0, n3))).toEqual(Array.from(outA.subarray(0, n1)));
          expect(a.permIsIdentity()).toBe(true);
          expect(n1).toBeGreaterThanOrEqual(1);
          expect(n1).toBeLessThanOrEqual(K);
          const set = Array.from(outA.subarray(0, n1));
          expect(new Set(set).size).toBe(n1);
          for (const x of set) expect(x >= 0 && x < K && Number.isInteger(x)).toBe(true);
          if (seq < K) expect(set).toEqual([seq]);
          if (isDense(seq, K, DENSE_PERIOD)) expect(n1).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 500 },
    );
  });
});
