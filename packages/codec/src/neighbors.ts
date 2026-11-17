// Block-set selection for a packet, shared by the Encoder and the Decoder.
// seq < K: systematic, {seq}, PRNG unused.
// Else dense iff D > 0 and (seq - K) mod D == D - 1: each Block included with probability 1/2.
// Else sparse: robust soliton degree, then a partial Fisher-Yates over a scratch permutation.
// The SET defines the packet; element order is irrelevant.
import { DENSE_PERIOD } from "./constants.js";
import { Prng } from "./prng.js";
import { sampleDegree, type SolitonTable } from "./soliton.js";
import { assertInteger } from "./validate.js";

/** Dense-or-sparse rule for a repair packet, from the index alone. Plain integer arithmetic. */
export function isDense(seq: number, K: number, D: number): boolean {
  return D > 0 && seq >= K && (seq - K) % D === D - 1;
}

/** Number of 32-bit words in a K-bit row. */
export function rowWords(K: number): number {
  return (K + 31) >>> 5;
}

/**
 * Turn raw PRNG words into a dense row: ignore bits at or above K in the last word, and if no
 * Block is left, use {seq mod K}. Block b is bit (b mod 32) of word floor(b / 32), LSB first.
 * Returns the number of Blocks in the row.
 */
export function rowFromWords(words: Uint32Array, K: number, seq: number, row: Uint32Array): number {
  const nw = rowWords(K);
  let count = 0;
  for (let w = 0; w < nw; w++) {
    let x = words[w] as number;
    if (w === nw - 1 && (K & 31) !== 0) x &= (1 << (K & 31)) - 1;
    x >>>= 0;
    row[w] = x;
    // popcount
    let v = x - ((x >>> 1) & 0x55555555);
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
    count += Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
  }
  if (count === 0) {
    const b = seq % K;
    row[b >>> 5] = (1 << (b & 31)) >>> 0;
    count = 1;
  }
  return count;
}

export class Neighbors {
  readonly K: number;
  readonly D: number;
  private readonly table: SolitonTable;
  private readonly prng = new Prng(0, 0);
  private readonly perm: Uint32Array;
  private readonly undoJ: Uint32Array;
  private readonly undoR: Uint32Array;
  private readonly words: Uint32Array;
  private readonly rowScratch: Uint32Array;

  constructor(K: number, table: SolitonTable, D: number = DENSE_PERIOD) {
    assertInteger("D", D, 0, 0xffffffff);
    this.K = K;
    this.D = D;
    this.table = table;
    this.perm = Uint32Array.from({ length: K }, (_, i) => i);
    this.undoJ = new Uint32Array(K);
    this.undoR = new Uint32Array(K);
    this.words = new Uint32Array(rowWords(K));
    this.rowScratch = new Uint32Array(rowWords(K));
  }

  isDense(seq: number): boolean {
    return isDense(seq, this.K, this.D);
  }

  /**
   * Write the Block indices of packet (sessionId, seq) into out[0..n) and return n.
   * `out` must have room for K entries. No allocation. Dispatch: systematic, dense, sparse.
   */
  select(sessionId: number, seq: number, out: Uint32Array): number {
    if (seq < this.K) {
      out[0] = seq;
      return 1;
    }
    if (isDense(seq, this.K, this.D)) {
      this.denseRow(sessionId, seq, this.rowScratch);
      let n = 0;
      for (let b = 0; b < this.K; b++) {
        if (((this.rowScratch[b >>> 5] as number) >>> (b & 31)) & 1) out[n++] = b;
      }
      return n;
    }
    return this.sparse(sessionId, seq, out);
  }

  /**
   * Dense K-bit row for (sessionId, seq): PRNG seeded as for sparse, no degree draw, word w is the
   * (w+1)-th output. Writes rowWords(K) words (high bits cleared) and returns the Block count.
   * The caller guarantees seq >= K; isDense is not consulted here.
   */
  denseRow(sessionId: number, seq: number, row: Uint32Array): number {
    this.prng.reset(sessionId, seq);
    const nw = this.words.length;
    for (let w = 0; w < nw; w++) this.words[w] = this.prng.next();
    return rowFromWords(this.words, this.K, seq, row);
  }

  /** Raw PRNG words of a dense packet (copy). For tests and reference vectors. */
  rawDenseWords(sessionId: number, seq: number): Uint32Array {
    this.prng.reset(sessionId, seq);
    const out = new Uint32Array(this.words.length);
    for (let w = 0; w < out.length; w++) out[w] = this.prng.next();
    return out;
  }

  private sparse(sessionId: number, seq: number, out: Uint32Array): number {
    const { K, prng, perm } = this;
    prng.reset(sessionId, seq);
    const d = sampleDegree(this.table, prng.next());
    for (let j = 0; j < d; j++) {
      const r = j + prng.bounded(K - j);
      const a = perm[j] as number;
      perm[j] = perm[r] as number;
      perm[r] = a;
      this.undoJ[j] = j;
      this.undoR[j] = r;
      out[j] = perm[j] as number;
    }
    for (let j = d - 1; j >= 0; j--) {
      const jj = this.undoJ[j] as number;
      const r = this.undoR[j] as number;
      const a = perm[jj] as number;
      perm[jj] = perm[r] as number;
      perm[r] = a;
    }
    return d;
  }

  /** Test hook: true when the scratch permutation is back to the identity. */
  permIsIdentity(): boolean {
    for (let i = 0; i < this.K; i++) if (this.perm[i] !== i) return false;
    return true;
  }
}
