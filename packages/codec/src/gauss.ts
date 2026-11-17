// Gaussian elimination over GF(2) on bitset rows. Rows are R x U bit matrices stored as
// Uint32Array with W = ceil(U / 32) words per row; column c is bit (c mod 32) of word floor(c / 32).
import { type BlockBuffer, xorBlock } from "./xor.js";

export function bitAt(m: Uint32Array, row: number, W: number, c: number): number {
  return ((m[row * W + (c >>> 5)] as number) >>> (c & 31)) & 1;
}

function xorRow(m: Uint32Array, dst: number, src: number, W: number, fromWord: number): void {
  const d = dst * W;
  const s = src * W;
  for (let w = fromWord; w < W; w++) m[d + w] = (m[d + w] as number) ^ (m[s + w] as number);
}

export interface PivotResult {
  readonly rank: number;
  /** For each column the original row chosen as its pivot, or -1 when the column has none. */
  readonly pivotRow: Int32Array;
}

/**
 * Phase A: rank and pivot rows by forward elimination on a COPY of `bits` (R rows, U columns).
 * Cost O(R * U * ceil(U / 32)).
 */
export function findPivots(bits: Uint32Array, R: number, U: number): PivotResult {
  const W = (U + 31) >>> 5;
  const work = bits.slice();
  const used = new Uint8Array(R);
  const pivotRow = new Int32Array(U).fill(-1);
  let rank = 0;
  for (let c = 0; c < U; c++) {
    let p = -1;
    for (let r = 0; r < R; r++) {
      if (used[r] === 0 && bitAt(work, r, W, c) === 1) {
        p = r;
        break;
      }
    }
    if (p < 0) continue;
    used[p] = 1;
    pivotRow[c] = p;
    rank++;
    for (let r = 0; r < R; r++) {
      if (r !== p && used[r] === 0 && bitAt(work, r, W, c) === 1) xorRow(work, r, p, W, c >>> 5);
    }
  }
  return { rank, pivotRow };
}

/**
 * Phase B: Gauss-Jordan on a full-rank U x U system. `m` holds U bit rows, `values` holds U value
 * Blocks (row i has value block i). Rows are permuted through `ord` instead of moving values.
 * On return the value of column c is values block ord[c]. Cost O(U^2) row operations.
 */
export function solveSquare(m: Uint32Array, U: number, values: BlockBuffer): Int32Array {
  const W = (U + 31) >>> 5;
  const ord = Int32Array.from({ length: U }, (_, i) => i);
  for (let c = 0; c < U; c++) {
    let p = -1;
    for (let r = c; r < U; r++) {
      if (bitAt(m, r, W, c) === 1) {
        p = r;
        break;
      }
    }
    if (p < 0) throw new RangeError("solveSquare: matrix is singular");
    if (p !== c) {
      for (let w = 0; w < W; w++) {
        const a = m[p * W + w] as number;
        m[p * W + w] = m[c * W + w] as number;
        m[c * W + w] = a;
      }
      const o = ord[p] as number;
      ord[p] = ord[c] as number;
      ord[c] = o;
    }
    for (let r = 0; r < U; r++) {
      if (r !== c && bitAt(m, r, W, c) === 1) {
        xorRow(m, r, c, W, c >>> 5);
        xorBlock(values, ord[r] as number, values, ord[c] as number);
      }
    }
  }
  return ord;
}
