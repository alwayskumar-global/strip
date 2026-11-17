// Seeded PRNG for tests and measurements (never Math.random). mulberry32 plus an FNV-1a style seed hash.
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Hash the cell parameters and a trial index into a 32-bit seed. */
export function hashSeed(...parts: Array<string | number>): number {
  let h = 2166136261;
  for (const p of parts) {
    for (const ch of String(p)) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    h ^= 44;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function randomBytes(rng: () => number, length: number): Uint8Array {
  return Uint8Array.from({ length }, () => Math.floor(rng() * 256));
}
