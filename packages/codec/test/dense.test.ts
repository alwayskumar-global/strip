import { describe, expect, it } from "vitest";
import { isDense, Neighbors, rowFromWords, rowWords } from "../src/neighbors.js";
import { getSolitonTable } from "../src/soliton.js";

const make = (K: number, D = 4) => new Neighbors(K, getSolitonTable(K), D);
const hex = (w: number) => w.toString(16).padStart(8, "0");

function denseSet(n: Neighbors, session: number, seq: number): number[] {
  const row = new Uint32Array(rowWords(n.K));
  n.denseRow(session, seq, row);
  const s: number[] = [];
  for (let b = 0; b < n.K; b++) if (((row[b >>> 5] as number) >>> (b & 31)) & 1) s.push(b);
  return s;
}

// Design reference vectors, cross-checked between a C and a JS implementation.
const refs = [
  { session: 0x12345678, seq: 53, K: 50, words: ["b955b964", "80f65a30"], set: [2, 5, 6, 8, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 28, 29, 31, 36, 37, 41, 43, 44, 46, 49] },
  {
    session: 0x12345678,
    seq: 103,
    K: 100,
    words: ["9ad034a6", "7b210bdb", "c61b69ef", "37855ee7"],
    set: [1, 2, 5, 7, 10, 12, 13, 20, 22, 23, 25, 27, 28, 31, 32, 33, 35, 36, 38, 39, 40, 41, 43, 48, 53, 56, 57, 59, 60, 61, 62, 64, 65, 66, 67, 69, 70, 71, 72, 75, 77, 78, 80, 81, 83, 84, 89, 90, 94, 95, 96, 97, 98],
  },
  { session: 0xdeadbeef, seq: 7, K: 1, words: ["2e0cc0c3"], set: [0] },
  { session: 0xdeadbeef, seq: 7, K: 5, words: ["2e0cc0c3"], set: [0, 1] },
];

describe("isDense (R2.2, R2.10)", () => {
  it("follows the index rule: dense iff D > 0 and (seq - K) mod D == D - 1", () => {
    for (const D of [0, 3, 4, 8]) {
      for (const K of [1, 7, 50]) {
        for (let seq = 0; seq < K + 100; seq++) {
          const want = D > 0 && seq >= K && (seq - K) % D === D - 1;
          expect(isDense(seq, K, D), `D=${D} K=${K} seq=${seq}`).toBe(want);
        }
      }
    }
  });
  it("D = 4 makes seq K+3, K+7, ... dense and nothing below K", () => {
    const K = 10;
    expect([13, 17, 21].every((s) => isDense(s, K, 4))).toBe(true);
    expect([10, 11, 12, 14, 15, 16].some((s) => isDense(s, K, 4))).toBe(false);
    expect(isDense(3, K, 4)).toBe(false);
  });
  it("D = 0 is never dense", () => {
    for (let seq = 0; seq < 200; seq++) expect(isDense(seq, 5, 0)).toBe(false);
  });
  it("has no PRNG or session dependence and works near 2^32 - 1 and after the wrap to K", () => {
    const K = 359;
    for (const D of [3, 4, 8]) {
      for (const seq of [4294967295, 4294967294, 4294967293, 4294967292, K, K + 1, K + D - 1, K + D, K + 2 * D - 1]) {
        expect(isDense(seq, K, D)).toBe((seq - K) % D === D - 1);
      }
    }
    // The wrap goes 2^32 - 1 -> K, so the rule restarts from j = 0.
    expect(isDense(359, 359, 4)).toBe(false);
    expect(isDense(359 + 3, 359, 4)).toBe(true);
  });
  it("Neighbors.isDense uses its own K and D", () => {
    const n = make(10, 3);
    expect(n.isDense(12)).toBe(true);
    expect(n.isDense(13)).toBe(false);
    expect(make(10, 0).isDense(12)).toBe(false);
  });
});

describe("dense Block sets (R2.11, R2.12)", () => {
  for (const r of refs) {
    it(`reference vector session=${hex(r.session)} seq=${r.seq} K=${r.K}`, () => {
      const n = make(r.K);
      expect(Array.from(n.rawDenseWords(r.session, r.seq)).map(hex)).toEqual(r.words);
      expect(denseSet(n, r.session, r.seq)).toEqual(r.set);
    });
  }

  it("a dispatched dense packet equals the dense row (seq 53, K = 50, D = 4)", () => {
    const n = make(50, 4);
    expect(n.isDense(53)).toBe(true);
    const out = new Uint32Array(50);
    const d = n.select(0x12345678, 53, out);
    expect(Array.from(out.subarray(0, d))).toEqual(refs[0]?.set);
  });

  it("high bits of the last word are ignored (K not a multiple of 32)", () => {
    const row = new Uint32Array(2);
    const cnt = rowFromWords(Uint32Array.from([0xffffffff, 0xffffffff]), 40, 7, row);
    expect(cnt).toBe(40);
    expect(row[0]).toBe(0xffffffff);
    expect(row[1]).toBe(0xff); // only bits 32..39
    const r2 = new Uint32Array(1);
    expect(rowFromWords(Uint32Array.from([0xffffffff]), 5, 9, r2)).toBe(5);
    expect(r2[0]).toBe(0b11111);
  });

  it("an empty Block set is replaced by {seq mod K}", () => {
    const row = new Uint32Array(2);
    expect(rowFromWords(new Uint32Array(2), 40, 123, row)).toBe(1);
    const set: number[] = [];
    for (let b = 0; b < 40; b++) if (((row[b >>> 5] as number) >>> (b & 31)) & 1) set.push(b);
    expect(set).toEqual([123 % 40]);
    // bits only above K also count as empty
    const row2 = new Uint32Array(1);
    expect(rowFromWords(Uint32Array.from([0xfffffff0]), 4, 6, row2)).toBe(1);
    expect(row2[0]).toBe(1 << (6 % 4));
  });

  it("each Block is included about half the time", () => {
    const K = 200;
    const n = make(K);
    let total = 0;
    const N = 400;
    for (let seq = K; seq < K + N; seq++) total += denseSet(n, 0x5eed, seq).length;
    expect(Math.abs(total / (N * K) - 0.5)).toBeLessThan(0.02);
  });

  it("is deterministic, session-dependent and has no degree draw (word 0 is the first output)", () => {
    const n = make(64);
    const a = denseSet(n, 1, 70);
    expect(denseSet(n, 1, 70)).toEqual(a);
    expect(denseSet(make(64), 1, 70)).toEqual(a);
    expect(denseSet(n, 2, 70)).not.toEqual(a);
  });
});

describe("dispatch order: systematic, then dense, then sparse", () => {
  it("seq < K is {seq} even if the index rule would say dense for a smaller K", () => {
    const n = make(10, 4);
    const out = new Uint32Array(10);
    expect(n.select(9, 3, out)).toBe(1);
    expect(out[0]).toBe(3);
  });
  it("D = 0 routes every repair packet to the sparse path", () => {
    const withDense = make(50, 4);
    const none = make(50, 0);
    const a = new Uint32Array(50);
    const b = new Uint32Array(50);
    const da = withDense.select(0x12345678, 53, a);
    const db = none.select(0x12345678, 53, b);
    expect(da).toBe(24);
    expect(db).not.toBe(24);
    expect(db).toBeLessThan(25);
  });
  it("non-dense repair packets are unchanged by the dense path", () => {
    const n = make(80, 4);
    const m = make(80, 0);
    const a = new Uint32Array(80);
    const b = new Uint32Array(80);
    for (const seq of [80, 81, 82, 84, 85, 86, 88]) {
      expect(n.select(3, seq, a)).toBe(m.select(3, seq, b));
      expect(Array.from(a.subarray(0, 3))).toEqual(Array.from(b.subarray(0, 3)));
    }
  });
  it("a scratch permutation survives interleaved dense and sparse calls", () => {
    const n = make(64, 4);
    const out = new Uint32Array(64);
    for (let seq = 64; seq < 164; seq++) {
      n.select(5, seq, out);
      expect(n.permIsIdentity()).toBe(true);
    }
  });
  it("rejects an invalid D", () => {
    expect(() => new Neighbors(10, getSolitonTable(10), -1)).toThrow();
    expect(() => new Neighbors(10, getSolitonTable(10), 1.5)).toThrow();
  });
});
