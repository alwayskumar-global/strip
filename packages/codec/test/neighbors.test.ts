import { describe, expect, it } from "vitest";
import { Neighbors } from "../src/neighbors.js";
import { getSolitonTable } from "../src/soliton.js";

// D = 0: these tests cover the systematic and sparse paths only (dense is in dense.test.ts).
const make = (K: number) => new Neighbors(K, getSolitonTable(K), 0);
const setOf = (n: Neighbors, session: number, seq: number, K: number): number[] => {
  const out = new Uint32Array(K);
  const d = n.select(session, seq, out);
  return Array.from(out.subarray(0, d));
};

describe("systematic packets (R2.3)", () => {
  it("seq i < K gives {i}", () => {
    const K = 37;
    const n = make(K);
    for (let i = 0; i < K; i++) expect(setOf(n, 0xdeadbeef, i, K)).toEqual([i]);
  });
  it("does not depend on the session id", () => {
    const n = make(20);
    expect(setOf(n, 1, 5, 20)).toEqual(setOf(n, 999, 5, 20));
  });
});

describe("sparse packets (R2.4, R6.2)", () => {
  it("are pure: same (session, seq, K) gives the same set, across selectors and repeated calls", () => {
    const K = 100;
    const a = make(K);
    const b = make(K);
    for (const seq of [100, 101, 150, 999, 123456, 4294967295]) {
      const first = setOf(a, 0x12345678, seq, K);
      expect(setOf(a, 0x12345678, seq, K)).toEqual(first);
      expect(setOf(b, 0x12345678, seq, K)).toEqual(first);
    }
  });

  it("depends on the session id and on seq", () => {
    const K = 200;
    const n = make(K);
    const seen = new Set<string>();
    for (let seq = K; seq < K + 50; seq++) seen.add(setOf(n, 7, seq, K).join(","));
    expect(seen.size).toBeGreaterThan(40);
    let diff = 0;
    for (let seq = K; seq < K + 50; seq++) {
      if (setOf(n, 1, seq, K).join(",") !== setOf(n, 2, seq, K).join(",")) diff++;
    }
    expect(diff).toBeGreaterThan(40);
  });

  it("returns distinct indices in [0, K) with degree in [1, K]", () => {
    for (const K of [1, 2, 3, 5, 16, 50, 359, 1000]) {
      const n = make(K);
      for (let seq = K; seq < K + 300; seq++) {
        const s = setOf(n, 0xabcdef01, seq, K);
        expect(s.length).toBeGreaterThanOrEqual(1);
        expect(s.length).toBeLessThanOrEqual(K);
        expect(new Set(s).size).toBe(s.length);
        for (const b of s) expect(b >= 0 && b < K && Number.isInteger(b)).toBe(true);
      }
    }
  });

  it("K = 1 repair packets are always {0}", () => {
    const n = make(1);
    for (let seq = 1; seq < 50; seq++) expect(setOf(n, 3, seq, 1)).toEqual([0]);
  });

  it("restores the scratch permutation (calls are independent of history)", () => {
    const K = 64;
    const used = make(K);
    const fresh = make(K);
    for (let seq = K; seq < K + 200; seq++) {
      expect(setOf(used, 55, seq, K)).toEqual(setOf(fresh, 55, seq, K));
      expect(used.permIsIdentity()).toBe(true);
    }
    // interleaved order does not matter
    const a = setOf(used, 55, K + 7, K);
    setOf(used, 55, K + 99, K);
    expect(setOf(used, 55, K + 7, K)).toEqual(a);
  });

  it("degree-1 frequency and mean degree follow the soliton table", () => {
    const K = 100;
    const t = getSolitonTable(K);
    const n = make(K);
    let ones = 0;
    let total = 0;
    const N = 6000;
    for (let seq = K; seq < K + N; seq++) {
      const d = setOf(n, 0x5eed, seq, K).length;
      if (d === 1) ones++;
      total += d;
    }
    const p1 = (t.cumT[1] as number) / 4294967296;
    expect(Math.abs(ones / N - p1)).toBeLessThan(0.03);
    let mean = 0;
    for (let i = 1; i <= K; i++) mean += i * (((t.cumT[i] as number) - (t.cumT[i - 1] as number)) / 4294967296);
    expect(Math.abs(total / N - mean) / mean).toBeLessThan(0.1);
  });
});
