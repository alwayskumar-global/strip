// Block-set selection for a packet, shared by the Encoder and the Decoder.
// seq < K: systematic, {seq}, PRNG unused. Otherwise sparse: robust soliton degree, then a partial
// Fisher-Yates over a scratch permutation. The SET defines the packet; element order is irrelevant.
import { Prng } from "./prng.js";
import { sampleDegree, type SolitonTable } from "./soliton.js";

export class Neighbors {
  readonly K: number;
  private readonly table: SolitonTable;
  private readonly prng = new Prng(0, 0);
  private readonly perm: Uint32Array;
  private readonly undoJ: Uint32Array;
  private readonly undoR: Uint32Array;

  constructor(K: number, table: SolitonTable) {
    this.K = K;
    this.table = table;
    this.perm = Uint32Array.from({ length: K }, (_, i) => i);
    this.undoJ = new Uint32Array(K);
    this.undoR = new Uint32Array(K);
  }

  /**
   * Write the Block indices of packet (sessionId, seq) into out[0..n) and return n.
   * `out` must have room for K entries. No allocation.
   */
  select(sessionId: number, seq: number, out: Uint32Array): number {
    if (seq < this.K) {
      out[0] = seq;
      return 1;
    }
    return this.sparse(sessionId, seq, out);
  }

  protected sparse(sessionId: number, seq: number, out: Uint32Array): number {
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
