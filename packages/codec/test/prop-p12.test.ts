import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { coldLimit, fColdPermille, fLatePermille, lateCount, overheadTable, R } from "../src/overhead.js";

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

describe("Property 12", () => {
  // Feature: codec, Property 12: overhead values interpolate linearly and clamp
  // Validates: Requirements 10.3
  it("Feature: codec, Property 12: overhead values interpolate linearly and clamp", () => {
    const rows = overheadTable.rows;
    const first = rows[0] as (typeof rows)[number];
    const last = rows[rows.length - 1] as (typeof rows)[number];
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20000 }), (K) => {
        for (const [fn, key] of [[R, "R"], [fLatePermille, "fLatePermille"], [fColdPermille, "fColdPermille"]] as const) {
          const v = fn(K);
          expect(Number.isInteger(v) && v >= 0).toBe(true);
          if (K <= first.K) expect(v).toBe(first[key]);
          else if (K >= last.K) expect(v).toBe(last[key]);
          else {
            const hiIdx = rows.findIndex((r) => r.K >= K);
            const hi = rows[hiIdx] as (typeof rows)[number];
            const lo = rows[hiIdx - 1] as (typeof rows)[number];
            if (K === hi.K) expect(v).toBe(hi[key]);
            else {
              expect(v).toBe(ceilDiv(lo[key] * (hi.K - K) + hi[key] * (K - lo.K), hi.K - lo.K));
              expect(v).toBeGreaterThanOrEqual(Math.min(lo[key], hi[key]));
              expect(v).toBeLessThanOrEqual(Math.max(lo[key], hi[key]));
            }
          }
        }
        expect(lateCount(K)).toBe(ceilDiv(fLatePermille(K) * K, 1000));
        expect(coldLimit(K)).toBe(ceilDiv(fColdPermille(K) * K, 1000));
      }),
      { numRuns: 300 },
    );
    for (const r of rows) {
      expect(R(r.K)).toBe(r.R);
      expect(fLatePermille(r.K)).toBe(r.fLatePermille);
    }
  });
});
