import { describe, expect, it } from "vitest";
import { coldLimit, fColdPermille, fLatePermille, interpolate, lateCount, overheadTable, R, type OverheadRow } from "../src/overhead.js";
import { codeOf } from "./helpers.js";

const rows: OverheadRow[] = [
  { K: 10, fLatePermille: 1000, fColdPermille: 2000, R: 4 },
  { K: 20, fLatePermille: 2000, fColdPermille: 1000, R: 9 },
  { K: 100, fLatePermille: 1500, fColdPermille: 1500, R: 50 },
];

describe("table file (R10.2, R10.7)", () => {
  it("holds the eight K values in ascending order with integer values", () => {
    expect(overheadTable.rows.map((r) => r.K)).toEqual([10, 25, 50, 100, 250, 500, 1000, 2000]);
    for (const r of overheadTable.rows) {
      for (const v of [r.K, r.fLatePermille, r.fColdPermille, r.R]) expect(Number.isInteger(v) && v >= 0).toBe(true);
    }
  });
  it("records c, delta and D, and is marked provisional until calibrated", () => {
    expect(overheadTable.c).toEqual([1, 10]);
    expect(overheadTable.delta).toEqual([1, 2]);
    expect(overheadTable.D).toBe(4);
    expect(overheadTable.provisional).toBe(true);
  });
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
