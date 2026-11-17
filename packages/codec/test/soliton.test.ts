import { describe, expect, it } from "vitest";
import { SOLITON_C, SOLITON_DELTA } from "../src/constants.js";
import { getSolitonTable, isqrt, lnQ, sampleDegree } from "../src/soliton.js";
import { codeOf } from "./helpers.js";

const F = 2 ** 48;
const TOL = 2 ** -40;

describe("isqrt", () => {
  it("is the floor square root", () => {
    for (const n of [0n, 1n, 2n, 3n, 4n, 15n, 16n, 17n, 10n ** 12n, 10n ** 30n + 12345n, (1n << 110n) - 1n, 1n << 110n]) {
      const r = isqrt(n);
      expect(r * r <= n && (r + 1n) * (r + 1n) > n, String(n)).toBe(true);
    }
  });
});

describe("lnQ (R2.2, R6.2)", () => {
  it("matches Math.log within 2^-40 over a wide range of Q48 inputs", () => {
    const xs = [1 / 3, 0.5, 0.999, 1, 1.0001, 1.5, 2, 2.718281828, 3, 7.5, 10, 100, 1234.5, 32768, 65535, 1e5, 2e5];
    for (const x of xs) {
      const v = BigInt(Math.round(x * F));
      const got = Number(lnQ(v)) / F;
      const want = Math.log(Number(v) / F);
      expect(Math.abs(got - want), `x=${x}`).toBeLessThan(TOL);
    }
  });
  it("is exact at 1 and monotone", () => {
    expect(lnQ(1n << 48n)).toBe(0n);
    let prev = lnQ(1n << 40n);
    for (let k = 41n; k < 70n; k++) {
      const cur = lnQ((1n << k) + (1n << (k - 3n)));
      expect(cur > prev).toBe(true);
      prev = cur;
    }
  });
  it("rejects non-positive input", () => {
    expect(() => lnQ(0n)).toThrow();
  });
});

describe("robust soliton table", () => {
  const Ks = [1, 2, 3, 10, 50, 100, 359, 1000, 16384];

  it("has the right size and ends at 2^32 for every K", () => {
    for (const K of Ks) {
      const t = getSolitonTable(K);
      expect(t.K).toBe(K);
      expect(t.cumT.length).toBe(K + 1);
      expect(t.cumT[K]).toBe(4294967296);
    }
  });

  it("is monotone non-decreasing, integer-valued, with positive degree-1 mass", () => {
    for (const K of Ks) {
      const t = getSolitonTable(K);
      expect(t.cumT[1] as number).toBeGreaterThan(0);
      for (let i = 1; i <= K; i++) {
        expect(Number.isInteger(t.cumT[i])).toBe(true);
        if (i > 1) expect(t.cumT[i] as number).toBeGreaterThanOrEqual(t.cumT[i - 1] as number);
      }
    }
  });

  it("K = 1 always samples degree 1", () => {
    const t = getSolitonTable(1);
    for (const u of [0, 1, 2147483648, 4294967295]) expect(sampleDegree(t, u)).toBe(1);
  });

  it("sampleDegree is the smallest i with u < cumT[i]", () => {
    const t = getSolitonTable(100);
    expect(sampleDegree(t, 0)).toBe(1);
    expect(sampleDegree(t, 4294967295)).toBeLessThanOrEqual(100);
    for (let i = 1; i < 100; i++) {
      const edge = t.cumT[i] as number;
      if (edge < 4294967296) {
        const d = sampleDegree(t, edge);
        expect(d).toBeGreaterThan(i);
        expect(t.cumT[d] as number).toBeGreaterThan(edge);
      }
      if (edge > 0) expect(sampleDegree(t, edge - 1)).toBeLessThanOrEqual(i);
    }
  });

  const floatCum = (K: number, c: number, delta: number): number[] => {
    const S = Math.max(1, c * Math.log(K / delta) * Math.sqrt(K));
    const pivot = Math.min(K, Math.max(1, Math.floor(K / S)));
    const w: number[] = [0];
    let total = 0;
    for (let i = 1; i <= K; i++) {
      let x = i === 1 ? 1 / K : 1 / (i * (i - 1));
      if (i < pivot) x += S / (K * i);
      else if (i === pivot) x += (S * Math.log(S / delta)) / K;
      w.push(x);
      total += x;
    }
    let acc = 0;
    return w.map((x) => (acc += x / total));
  };

  it("agrees with a floating-point reference of the same formulas (test-side check)", () => {
    const pairs: Array<[readonly [number, number], readonly [number, number]]> = [
      [SOLITON_C, SOLITON_DELTA],
      [[3, 100], [1, 2]],
      [[1, 5], [1, 100]],
      [[1, 5], [1, 2]],
    ];
    for (const [c, delta] of pairs) {
      for (const K of [50, 100, 500, 2000]) {
        const ref = floatCum(K, c[0] / c[1], delta[0] / delta[1]);
        const t = getSolitonTable(K, { c, delta });
        for (let i = 1; i <= K; i++) {
          expect(Math.abs((t.cumT[i] as number) / 4294967296 - (ref[i] as number)), `c=${c} d=${delta} K=${K} i=${i}`).toBeLessThan(1e-7);
        }
      }
    }
  });

  it("is a pure function of K and the parameters, and cached by identity", () => {
    const a = getSolitonTable(200);
    expect(getSolitonTable(200)).toBe(a);
    const other = getSolitonTable(200, { c: [3, 100], delta: [1, 2] });
    expect(other).not.toBe(a);
    expect(Array.from(other.cumT)).not.toEqual(Array.from(a.cumT));
    const again = getSolitonTable(200, { c: [1, 10], delta: [1, 2] });
    expect(Array.from(again.cumT)).toEqual(Array.from(a.cumT));
  });

  it("is parameterised: different (c, delta) give different tables", () => {
    const base = getSolitonTable(500, { c: [1, 10], delta: [1, 2] });
    const other = getSolitonTable(500, { c: [1, 5], delta: [1, 100] });
    expect(Array.from(other.cumT)).not.toEqual(Array.from(base.cumT));
  });

  it("rejects invalid K and parameters with INVALID_INPUT", () => {
    expect(codeOf(() => getSolitonTable(0))).toBe("INVALID_INPUT");
    expect(codeOf(() => getSolitonTable(1.5))).toBe("INVALID_INPUT");
    expect(codeOf(() => getSolitonTable(10, { c: [0, 1], delta: [1, 2] }))).toBe("INVALID_INPUT");
    expect(codeOf(() => getSolitonTable(10, { c: [1, 10], delta: [1, 1] }))).toBe("INVALID_INPUT");
    expect(codeOf(() => getSolitonTable(10, { c: [1, 10], delta: [3, 2] }))).toBe("INVALID_INPUT");
    expect(codeOf(() => getSolitonTable(10, { c: [1.5, 10], delta: [1, 2] }))).toBe("INVALID_INPUT");
  });
});
