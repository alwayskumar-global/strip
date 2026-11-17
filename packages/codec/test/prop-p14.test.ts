import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isDense, Neighbors } from "../src/neighbors.js";
import { getSolitonTable } from "../src/soliton.js";

type Kind = "systematic" | "dense" | "sparse";
/** The index rule, restated independently of the implementation. */
const ruleKind = (seq: number, K: number, D: number): Kind => (seq < K ? "systematic" : D > 0 && (seq - K) % D === D - 1 ? "dense" : "sparse");

describe("Property 14", () => {
  // Feature: codec, Property 14: packet kind follows the index rule
  // Validates: Requirements 2.2, 2.10
  it("Feature: codec, Property 14: packet kind follows the index rule", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20000 }).chain((K) =>
          fc.record({
            K: fc.constant(K),
            seq: fc.oneof(fc.integer({ min: 0, max: 2 * K + 10 }), fc.integer({ min: 4294967246, max: 4294967295 }), fc.integer({ min: K, max: K + 100 })),
            D: fc.constantFrom(0, 3, 4, 8),
            session: fc.integer({ min: 0, max: 0xffffffff }),
          }),
        ),
        ({ K, seq, D, session }) => {
          const kind = ruleKind(seq, K, D);
          expect(seq >= K && isDense(seq, K, D)).toBe(kind === "dense");
          expect(seq < K ? false : isDense(seq, K, D) ? true : false).toBe(kind === "dense");
          if (K <= 150) {
            // the dispatch really uses that kind: systematic {seq}, all-dense generator, or the sparse path
            const table = getSolitonTable(K);
            const out = new Uint32Array(K);
            const ref = new Uint32Array(K);
            const n = new Neighbors(K, table, D).select(session, seq, out);
            const got = Array.from(out.subarray(0, n)).sort((a, b) => a - b);
            let m: number;
            if (kind === "systematic") m = (ref[0] = seq, 1);
            else if (kind === "dense") m = new Neighbors(K, table, 1).select(session, seq, ref); // D = 1: every repair packet is dense
            else m = new Neighbors(K, table, 0).select(session, seq, ref); // D = 0: every repair packet is sparse
            expect(got).toEqual(Array.from(ref.subarray(0, m)).sort((a, b) => a - b));
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
