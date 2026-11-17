// Integer-only robust soliton table. BigInt fixed point with F = 2^48, built once per K and cached.
// BigInt arithmetic is exact; it runs only at table build, never per packet.
import { SOLITON_C, SOLITON_DELTA } from "./constants.js";
import { invalidInput } from "./validate.js";

export interface SolitonParams {
  readonly c: readonly [number, number];
  readonly delta: readonly [number, number];
}

export const DEFAULT_SOLITON: SolitonParams = { c: SOLITON_C, delta: SOLITON_DELTA };

export interface SolitonTable {
  readonly K: number;
  /** cumT[i] = floor(W_i * 2^32 / W_K) for i in 1..K, cumT[K] = 2^32. Index 0 is unused. */
  readonly cumT: Float64Array;
}

const FBITS = 48n;
const F = 1n << FBITS;
/** floor(ln 2 * 2^48) */
export const LN2_Q48 = 195103586505167n;
const TWO32 = 4294967296n;

/** floor(sqrt(n)) for n >= 0 (Newton iteration). */
export function isqrt(n: bigint): bigint {
  if (n < 0n) throw new RangeError("isqrt of negative");
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length + 1) >> 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** Natural log of a positive Q48 value, as a signed Q48 value. */
export function lnQ(v: bigint): bigint {
  if (v <= 0n) throw new RangeError("lnQ of non-positive");
  const n = BigInt(v.toString(2).length - 1);
  let m = n >= FBITS ? v >> (n - FBITS) : v << (FBITS - n);
  let frac = 0n;
  for (let i = 0; i < 48; i++) {
    m = (m * m) >> FBITS;
    frac <<= 1n;
    if (m >= 2n * F) {
      m >>= 1n;
      frac |= 1n;
    }
  }
  const log2Q = ((n - FBITS) << FBITS) + frac;
  return (log2Q * LN2_Q48) >> FBITS;
}

function checkRational(name: string, r: readonly [number, number], belowOne: boolean): void {
  const [num, den] = r;
  if (!Number.isInteger(num) || !Number.isInteger(den) || num < 1 || den < 1) {
    invalidInput(`${name} must be a rational with positive integer parts`);
  }
  if (belowOne && num >= den) invalidInput(`${name} must be below 1`);
}

function build(K: number, params: SolitonParams): SolitonTable {
  const [cn, cd] = params.c.map(BigInt) as [bigint, bigint];
  const [dn, dd] = params.delta.map(BigInt) as [bigint, bigint];
  const Kb = BigInt(K);
  const SQ = isqrt(Kb << 96n); // sqrt(K) in Q48
  const lnKd = lnQ(((Kb * dd) << FBITS) / dn); // ln(K / delta)
  let S = (((lnKd * SQ) / F) * cn) / cd; // c * ln(K / delta) * sqrt(K)
  if (S < F) S = F;
  let pivotB = (Kb * F) / S;
  if (pivotB < 1n) pivotB = 1n;
  if (pivotB > Kb) pivotB = Kb;
  const pivot = Number(pivotB);

  const cum = new Array<bigint>(K + 1).fill(0n);
  let acc = 0n;
  for (let i = 1; i <= K; i++) {
    const ib = BigInt(i);
    let w = i === 1 ? F / Kb : F / (ib * (ib - 1n));
    if (i < pivot) w += S / (Kb * ib);
    else if (i === pivot) w += (S * lnQ((S * dd) / dn)) / F / Kb;
    acc += w;
    cum[i] = acc;
  }
  const cumT = new Float64Array(K + 1);
  for (let i = 1; i < K; i++) cumT[i] = Number(((cum[i] as bigint) * TWO32) / acc);
  cumT[K] = 4294967296;
  return { K, cumT };
}

const cache = new Map<string, SolitonTable>();
const CACHE_LIMIT = 16;

/** Pure function of (K, params). Cached by key; the cache never changes results. */
export function getSolitonTable(K: number, params: SolitonParams = DEFAULT_SOLITON): SolitonTable {
  if (!Number.isInteger(K) || K < 1) invalidInput("K must be a positive integer");
  checkRational("c", params.c, false);
  checkRational("delta", params.delta, true);
  const key = `${K}|${params.c[0]}/${params.c[1]}|${params.delta[0]}/${params.delta[1]}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const table = build(K, params);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, table);
  return table;
}

/** Smallest i in [1, K] with u < cumT[i], for u an unsigned 32-bit draw. */
export function sampleDegree(table: SolitonTable, u: number): number {
  let lo = 1;
  let hi = table.K;
  const t = table.cumT;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (u < (t[mid] as number)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
