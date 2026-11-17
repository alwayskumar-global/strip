import { describe, expect, it } from "vitest";
import { coldLimit, fColdPermille, fLatePermille, interpolate, lateCount, overheadTable, R, type OverheadRow } from "../src/overhead.js";
import { calibrate } from "../perf/calibrate.js";
import { DENSE_PERIOD, SOLITON_C, SOLITON_DELTA } from "../src/constants.js";
import { codeOf } from "./helpers.js";

const rows: OverheadRow[] = [
  { K: 10, fLatePermille: 1000, fColdPermille: 2000, R: 4 },
  { K: 20, fLatePermille: 2000, fColdPermille: 1000, R: 9 },
  { K: 100, fLatePermille: 1500, fColdPermille: 1500, R: 50 },
];

describe("table file (R10.2, R10.7)", () => {
  it("holds the eleven K values in ascending order with integer values and a per-row N", () => {
    expect(overheadTable.rows.map((r) => r.K)).toEqual([10, 25, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 16384]);
    for (const r of overheadTable.rows) {
      for (const v of [r.K, r.fLatePermille, r.fColdPermille, r.R]) expect(Number.isInteger(v) && v >= 0).toBe(true);
      expect(Number.isInteger(r.N) && (r.N as number) > 0).toBe(true);
      expect(r.fLatePermille).toBeGreaterThanOrEqual(1000);
      expect(r.fColdPermille).toBeGreaterThanOrEqual(1000);
    }
    expect("samples" in overheadTable).toBe(false);
  });
  it("records the quantile per row: 0.999 for K <= 500 (N >= 1000) and 0.995 for K >= 1000", () => {
    for (const r of overheadTable.rows) {
      expect(r.quantile).toBe(r.K <= 500 ? "0.999" : "0.995");
      if (r.quantile === "0.999") expect(r.N as number).toBeGreaterThanOrEqual(1000);
    }
    expect("quantile" in overheadTable).toBe(false);
  });
  it("is calibrated (not provisional) and records the frozen c, delta and D", () => {
    expect(overheadTable.provisional).toBeUndefined();
    expect(overheadTable.c).toEqual(SOLITON_C);
    expect(overheadTable.delta).toEqual(SOLITON_DELTA);
    expect(overheadTable.D).toBe(DENSE_PERIOD);
  });
});

describe("fresh calibration matches the committed rows for K = 10, 25, 50 (R10.4, R10.5)", () => {
  it("reproduces fLate, fCold and R with the table's own N, c, delta and D", async () => {
    const small = overheadTable.rows.filter((r) => [10, 25, 50].includes(r.K));
    expect(small.length).toBe(3);
    const fresh = await calibrate({
      format: { c: overheadTable.c, delta: overheadTable.delta, D: overheadTable.D },
      Ks: small.map((r) => r.K),
      samples: Object.fromEntries(small.map((r) => [r.K, r.N as number])),
      quantiles: Object.fromEntries(small.map((r) => [r.K, Number(r.quantile)])),
    });
    fresh.forEach((f, i) => {
      const row = small[i] as OverheadRow;
      expect({ K: f.K, N: f.N, quantile: String(f.quantile), fLatePermille: f.fLatePermille, fColdPermille: f.fColdPermille, R: f.R }).toEqual({
        K: row.K,
        N: row.N,
        quantile: row.quantile,
        fLatePermille: row.fLatePermille,
        fColdPermille: row.fColdPermille,
        R: row.R,
      });
    });
  }, 180000);
});

describe("interpolation and clamping (R10.3)", () => {
  it("returns the row value at table K", () => {
    expect(interpolate(rows, 10, "R")).toBe(4);
    expect(interpolate(rows, 20, "R")).toBe(9);
    expect(interpolate(rows, 100, "fLatePermille")).toBe(1500);
  });
  it("interpolates linearly in K and rounds up", () => {
    expect(interpolate(rows, 15, "fLatePermille")).toBe(1500);
    expect(interpolate(rows, 12, "R")).toBe(Math.ceil((4 * 8 + 9 * 2) / 10)); // 5
    expect(interpolate(rows, 15, "R")).toBe(7); // 6.5 -> 7
    expect(interpolate(rows, 60, "fColdPermille")).toBe(1250);
    expect(interpolate(rows, 11, "fColdPermille")).toBe(1900);
  });
  it("clamps below the first and above the last K", () => {
    expect(interpolate(rows, 1, "R")).toBe(4);
    expect(interpolate(rows, 9, "R")).toBe(4);
    expect(interpolate(rows, 101, "R")).toBe(50);
    expect(interpolate(rows, 4294967295, "R")).toBe(50);
  });
  it("is monotone for a monotone table", () => {
    let prev = 0;
    for (let K = 1; K < 150; K++) {
      const v = interpolate(rows, K, "R");
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("rejects a non-integer or out-of-range K", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(codeOf(() => interpolate(rows, bad, "R"))).toBe("INVALID_INPUT");
  });
});

describe("committed-table accessors (R10.1)", () => {
  it("return integers and use the table rows at table K", () => {
    for (const r of overheadTable.rows) {
      expect(fLatePermille(r.K)).toBe(r.fLatePermille);
      expect(fColdPermille(r.K)).toBe(r.fColdPermille);
      expect(R(r.K)).toBe(r.R);
      expect(lateCount(r.K)).toBe(Math.ceil((r.fLatePermille * r.K) / 1000));
      expect(coldLimit(r.K)).toBe(Math.ceil((r.fColdPermille * r.K) / 1000));
    }
  });
  it("give integer, non-negative values for any K", () => {
    for (const K of [1, 2, 7, 33, 359, 1500, 11500, 16384]) {
      for (const v of [R(K), lateCount(K), coldLimit(K), fLatePermille(K), fColdPermille(K)]) {
        expect(Number.isInteger(v) && v >= 0).toBe(true);
      }
    }
  });
});
