import { describe, expect, it } from "vitest";
import { findPivots, solveSquare } from "../src/gauss.js";
import { BlockBuffer } from "../src/xor.js";

// Deterministic generator for bit matrices (no Math.random).
function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 8;
  };
}

function matrix(rows: number, cols: number, seed: number, density = 0.5): Uint32Array {
  const W = (cols + 31) >>> 5;
  const m = new Uint32Array(rows * W);
  const next = lcg(seed);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if ((next() & 0xffff) / 0x10000 < density) m[r * W + (c >>> 5)] = (m[r * W + (c >>> 5)] as number) | (1 << (c & 31));
  }
  return m;
}

/** Plain rank over GF(2) with boolean arrays, as an independent reference. */
function naiveRank(m: Uint32Array, rows: number, cols: number): number {
  const W = (cols + 31) >>> 5;
  const a = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (((m[r * W + (c >>> 5)] as number) >>> (c & 31)) & 1) === 1));
  let rank = 0;
  for (let c = 0; c < cols; c++) {
    const p = a.findIndex((row, i) => i >= rank && row[c]);
    if (p < 0) continue;
    [a[rank], a[p]] = [a[p] as boolean[], a[rank] as boolean[]];
    for (let i = 0; i < rows; i++) if (i !== rank && (a[i] as boolean[])[c]) (a[i] as boolean[]).forEach((_, j) => ((a[i] as boolean[])[j] = (a[i] as boolean[])[j] !== (a[rank] as boolean[])[j]));
    rank++;
  }
  return rank;
}

describe("findPivots (R5.8)", () => {
  it("matches a naive GF(2) rank on assorted shapes, without modifying its input", () => {
    for (const [R, U, seed] of [[5, 5, 1], [8, 6, 2], [40, 33, 3], [70, 64, 4], [100, 65, 5], [30, 30, 6], [12, 40, 7]] as const) {
      const m = matrix(R, U, seed);
      const copy = m.slice();
      const { rank, pivotRow } = findPivots(m, R, U);
      expect(m).toEqual(copy);
      expect(rank).toBe(naiveRank(m, R, U));
      expect(Array.from(pivotRow).filter((r) => r >= 0).length).toBe(rank);
      expect(new Set(Array.from(pivotRow).filter((r) => r >= 0)).size).toBe(rank);
    }
  });
  it("reports a zero column and a duplicate row as rank deficiency", () => {
    const W = 1;
    const m = new Uint32Array([0b011, 0b011, 0b100]);
    const r = findPivots(m, 3, 4);
    expect(r.rank).toBe(2);
    expect(r.pivotRow[3]).toBe(-1);
    expect(W).toBe(1);
  });
  it("the chosen pivot rows form an independent set", () => {
    const R = 50;
    const U = 40;
    const m = matrix(R, U, 11, 0.2);
    const { rank, pivotRow } = findPivots(m, R, U);
    const W = (U + 31) >>> 5;
    const chosen = Array.from(pivotRow).filter((r) => r >= 0);
    const sub = new Uint32Array(chosen.length * W);
    chosen.forEach((r, i) => sub.set(m.subarray(r * W, (r + 1) * W), i * W));
    expect(naiveRank(sub, chosen.length, U)).toBe(rank);
  });
});

describe("solveSquare", () => {
  it("recovers unknown Blocks from a full-rank system", () => {
    for (const [U, seed, bs] of [[1, 1, 16], [7, 2, 17], [33, 3, 19], [64, 4, 20], [65, 5, 16]] as const) {
      // Find a full-rank U x U matrix by taking more rows and selecting pivots.
      const R = U + 12;
      const bits = matrix(R, U, seed);
      const { rank, pivotRow } = findPivots(bits, R, U);
      expect(rank).toBe(U);
      const W = (U + 31) >>> 5;
      const truth = new BlockBuffer(U, bs);
      const next = lcg(seed + 100);
      for (let i = 0; i < U; i++) for (let t = 0; t < bs; t++) truth.block(i)[t] = next() & 0xff;
      const m = new Uint32Array(U * W);
      const values = new BlockBuffer(U, bs);
      for (let c = 0; c < U; c++) {
        const row = pivotRow[c] as number;
        m.set(bits.subarray(row * W, (row + 1) * W), c * W);
        for (let j = 0; j < U; j++) {
          if (((bits[row * W + (j >>> 5)] as number) >>> (j & 31)) & 1) {
            for (let t = 0; t < bs; t++) values.block(c)[t] = (values.block(c)[t] as number) ^ (truth.block(j)[t] as number);
          }
        }
      }
      const ord = solveSquare(m, U, values);
      for (let c = 0; c < U; c++) expect(values.block(ord[c] as number), `U=${U} c=${c}`).toEqual(truth.block(c));
    }
  });
  it("throws on a singular matrix", () => {
    const m = new Uint32Array([0b01, 0b01]);
    expect(() => solveSquare(m, 2, new BlockBuffer(2, 16))).toThrow();
  });
});
