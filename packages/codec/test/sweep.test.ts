import { describe, expect, it } from "vitest";
import type { KResult } from "../perf/calibrate.js";
import { type ComboResult, recommend, renderSweep, runSweep, sweepFormats } from "../perf/sweep.js";

const q = { q99: 1, q995: 1, rate995: 1, wilson995: 0.9 };
const row = (K: number): KResult => ({ K, N: 3, late: q, cold: q, page: q, fLatePermille: 1000, fColdPermille: 1000, R: 1, fLate99Permille: 1000, fCold99Permille: 1000, R99: 1 });
const combo = (D: number, fCold: number, fLate: number, ms: number | null): ComboResult => ({
  format: { c: [1, 10], delta: [1, 2], D },
  results: [row(50)],
  dense1MiB: ms === null ? null : { K: 359, D, payloadBytes: 1, medianMs: ms, p95Ms: ms, runsMs: [ms], node: "v", cpu: "cpu" },
  dense32MiB: null,
  sumFCold: fCold,
  sumFLate: fLate,
  sumR: 0,
});

describe("sweep (R2.2, R2.7, R2.8, R4.7, R8.7)", () => {
  it("covers 2 (c, delta) pairs x D in {none, 8, 4, 3} = 8 combinations", () => {
    const f = sweepFormats();
    expect(f.length).toBe(8);
    expect(f.map((x) => x.D)).toEqual([0, 8, 4, 3, 0, 8, 4, 3]);
    expect(new Set(f.map((x) => `${x.c.join("/")}|${x.delta.join("/")}`)).size).toBe(2);
  });
  it("recommends the lowest summed f_cold, then f_late, then dense cost", () => {
    expect(recommend([combo(8, 5000, 3000, 1), combo(4, 4000, 9000, 9)])?.format.D).toBe(4);
    expect(recommend([combo(8, 4000, 3000, 1), combo(4, 4000, 2000, 9)])?.format.D).toBe(4);
    expect(recommend([combo(8, 4000, 2000, 5), combo(4, 4000, 2000, 2)])?.format.D).toBe(4);
    expect(recommend([])).toBeUndefined();
  });
  it("runs end to end on a tiny configuration and renders the stated trial counts", async () => {
    const sweep = await runSweep({ formats: sweepFormats().slice(0, 2), Ks: [10], samples: { 10: 5 }, measureDense: false });
    expect(sweep.combos.length).toBe(2);
    expect(sweep.recommended).toBeDefined();
    const text = renderSweep(sweep, { 10: 5 });
    expect(text).toContain("K=10: N=5");
    expect(text).toContain("Wall-clock");
    expect(text).toContain("D=none");
  }, 120000);
});
