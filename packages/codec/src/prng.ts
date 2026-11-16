// xoshiro128** 1.1 (Blackman and Vigna, public domain), seeded by SplitMix32.
// Integer-only. Reference: https://prng.di.unimi.it/xoshiro128starstar.c

const GOLDEN_GAMMA = 0x9e3779b9;
const SEQ_MIX = 0x9e3779b1;

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Seed for (sessionId, seq). Injective in seq for a fixed session. */
export function seed32(sessionId: number, seq: number): number {
  return (sessionId ^ Math.imul(seq, SEQ_MIX)) >>> 0;
}

export class Prng {
  private s0 = 0;
  private s1 = 0;
  private s2 = 0;
  private s3 = 0;

  constructor(sessionId: number, seq: number) {
    this.reset(sessionId, seq);
  }

  /** Re-seed in place (no allocation). */
  reset(sessionId: number, seq: number): void {
    let state = seed32(sessionId, seq);
    const out = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      state = (state + GOLDEN_GAMMA) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      out[i] = (z ^ (z >>> 16)) >>> 0;
    }
    this.s0 = out[0] as number;
    this.s1 = out[1] as number;
    this.s2 = out[2] as number;
    this.s3 = out[3] as number;
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Current state words, for test vectors. */
  state(): [number, number, number, number] {
    return [this.s0, this.s1, this.s2, this.s3];
  }

  /** Next unsigned 32-bit output. */
  next(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Unbiased integer in [0, n) for n in [1, 2^32]. Draws nothing when n == 1. */
  bounded(n: number): number {
    if (n === 1) return 0;
    if (n === 4294967296) return this.next();
    const bits = 32 - Math.clz32(n - 1);
    for (;;) {
      const x = this.next() >>> (32 - bits);
      if (x < n) return x;
    }
  }
}
