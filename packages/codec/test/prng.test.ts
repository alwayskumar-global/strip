import { describe, expect, it } from "vitest";
import { Prng, seed32 } from "../src/prng.js";

const hex = (n: number) => n.toString(16).padStart(8, "0");

// Cross-checked design-time vectors (C reference and an independent JS implementation).
const vectors = [
  { session: 0x12345678, seq: 0, seed: "12345678", state: ["047660ea", "6072b3dc", "49dccea9", "3bc1e822"], out: ["14ced9f9", "7e9a7d82", "4c49953b", "7c472bc4"] },
  { session: 0x12345678, seq: 1, seed: "8c032fc9", state: ["a3f886a5", "3b1e4b3a", "d532f859", "afd58365"], out: ["299c99ab", "26b9e952", "797f6441", "ce7b1972"] },
  { session: 0xdeadbeef, seq: 4000000000, seed: "cb5316ef", state: ["b3e8a9cd", "a539246e", "424a4fdd", "787255f9"], out: ["85b3ac05", "b09815eb", "f7d494d0", "15187836"] },
];

describe("prng", () => {
  for (const v of vectors) {
    it(`R6.2: vector session=${hex(v.session)} seq=${v.seq}`, () => {
      expect(hex(seed32(v.session, v.seq))).toBe(v.seed);
      const p = new Prng(v.session, v.seq);
      expect(p.state().map(hex)).toEqual(v.state);
      expect([p.next(), p.next(), p.next(), p.next()].map(hex)).toEqual(v.out);
    });
  }

  it("R6.3: identical seeds give identical output for 1000 values", () => {
    const a = new Prng(0xcafef00d, 77);
    const b = new Prng(0xcafef00d, 77);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("different seq gives a different stream", () => {
    const a = new Prng(1, 1);
    const b = new Prng(1, 2);
    expect(a.next() === b.next() && a.next() === b.next()).toBe(false);
  });

  it("reset reproduces a fresh generator", () => {
    const a = new Prng(5, 6);
    a.next();
    a.reset(9, 10);
    const b = new Prng(9, 10);
    for (let i = 0; i < 20; i++) expect(a.next()).toBe(b.next());
  });

  it("seed32 is injective in seq for a fixed session (sample)", () => {
    const seen = new Set<number>();
    for (let seq = 0; seq < 5000; seq++) seen.add(seed32(0xabcdef01, seq));
    expect(seen.size).toBe(5000);
  });

  it("outputs are unsigned 32-bit integers", () => {
    const p = new Prng(0xffffffff, 0xffffffff);
    for (let i = 0; i < 1000; i++) {
      const x = p.next();
      expect(Number.isInteger(x) && x >= 0 && x <= 0xffffffff).toBe(true);
    }
  });

  describe("bounded", () => {
    it("n = 1 returns 0 without drawing", () => {
      const a = new Prng(3, 4);
      const b = new Prng(3, 4);
      expect(a.bounded(1)).toBe(0);
      expect(a.next()).toBe(b.next());
    });
    it("n = 2^32 returns the raw output", () => {
      const a = new Prng(3, 4);
      const b = new Prng(3, 4);
      expect(a.bounded(4294967296)).toBe(b.next());
    });
    it("stays in range for assorted n", () => {
      const p = new Prng(11, 12);
      for (const n of [2, 3, 5, 7, 31, 32, 33, 100, 1000, 16384, 65535, 1 << 20, 2 ** 31, 2 ** 31 + 1, 4294967295]) {
        for (let i = 0; i < 200; i++) {
          const x = p.bounded(n);
          expect(x >= 0 && x < n && Number.isInteger(x)).toBe(true);
        }
      }
    });
    it("is roughly uniform for n = 6 (rejection sampling is unbiased)", () => {
      const p = new Prng(21, 22);
      const counts = new Array<number>(6).fill(0);
      const N = 60000;
      for (let i = 0; i < N; i++) {
        const x = p.bounded(6);
        counts[x] = (counts[x] as number) + 1;
      }
      // sigma is about 91; the stream is deterministic, so this check is stable.
      for (const c of counts) expect(Math.abs(c - N / 6)).toBeLessThan(500);
    });
  });
});
