import { DEFAULT_MAX_BLOCK_COUNT, DEFAULT_MAX_GAUSSIAN_BLOCKS, DEFAULT_MAX_PAYLOAD_BYTES, maxDenseRows } from "./constants.js";
import { CodecError, type ErrorCode, type IgnoreReason } from "./errors.js";
import { DEFAULT_FORMAT, type FormatParams } from "./format.js";
import { findPivots, solveSquare } from "./gauss.js";
import { computeDigest, sha256WebCrypto, type HashFn } from "./hash.js";
import { parseMetadata, readRecordLength, type Metadata } from "./metadata.js";
import { Neighbors, rowWords } from "./neighbors.js";
import { decodePacket, type Limits, type PacketFields } from "./packet.js";
import { getSolitonTable } from "./soliton.js";
import {
  assertFunction,
  assertObject,
  validateMaxBlockCount,
  validateMaxGaussianBlocks,
  validateMaxPayloadBytes,
  validatePacketBytes,
} from "./validate.js";
import { BlockBuffer, copyBlock, xorBlock } from "./xor.js";

export interface DecoderOptions {
  readonly hash?: HashFn;
  readonly maxPayloadBytes?: number;
  readonly maxBlockCount?: number;
  /** Largest unsolved-block count for which Gaussian elimination is attempted. Default 1024. */
  readonly maxGaussianBlocks?: number;
}

export interface Progress {
  readonly solvedBlocks: number;
  readonly totalBlocks: number;
  readonly distinctPackets: number;
  readonly complete: boolean;
}

export type PushStatus =
  | { readonly kind: "accepted"; readonly progress: Progress }
  | { readonly kind: "ignored"; readonly reason: IgnoreReason; readonly progress: Progress }
  | { readonly kind: "rejected"; readonly code: ErrorCode; readonly progress: Progress };

export interface DecodedFile {
  readonly payload: Uint8Array;
  readonly metadata: Metadata;
}

export interface Decoder {
  push(packet: Uint8Array): Promise<PushStatus>;
  result(): DecodedFile;
  progress(): Progress;
}

/** Internal observation points for tests and calibration. */
export interface DecoderHooks {
  /** Called at the start of every Gaussian elimination attempt. */
  readonly onGauss?: (info: { rows: number; unsolved: number }) => void;
}

export interface DecoderDebug {
  readonly phase: string;
  readonly liveEquations: number;
  readonly equationCapacity: number;
  readonly seen: number;
  readonly solved: readonly number[];
  readonly denseStored: number;
  readonly denseCapacity: number;
}

export interface DenseRowInfo {
  /** Columns (Block indices) set in the row. */
  readonly columns: readonly number[];
  /** Columns whose solved Block has already been XORed into the payload. */
  readonly folded: readonly number[];
  readonly payload: Uint8Array;
}

export interface InternalDecoder extends Decoder {
  debug(): DecoderDebug;
  peekBlock(i: number): Uint8Array | undefined;
  /** Fold every stored dense row against the Blocks solved so far. */
  foldDense(): void;
  /** Stored dense rows in slot order (copies). */
  denseRows(): DenseRowInfo[];
}

type Phase = "idle" | "collecting" | "verifying" | "complete" | "failed";

const FREE = 0;
const LIVE = 1;
const DEAD = 2;
const CHUNK = 64;

class DecoderImpl implements InternalDecoder {
  private readonly hash: HashFn;
  private readonly limits: Limits;
  private readonly maxGauss: number;
  private readonly format: FormatParams;
  private readonly hooks: DecoderHooks;

  private chain: Promise<unknown> = Promise.resolve();
  private phase: Phase = "idle";

  // Session, fixed by the first valid packet.
  private sessionId = 0;
  private L = 0;
  private bs = 0;
  private K = 0;
  private blocks!: BlockBuffer;
  private solved!: Uint8Array;
  private solvedCount = 0;
  private readonly seen = new Set<number>();
  private neighbors!: Neighbors;
  private scratch!: BlockBuffer;
  private setBuf!: Uint32Array;
  private unsolvedBuf!: Uint32Array;

  // Sparse equations (degree >= 2): value, remaining degree, XOR of remaining unsolved Block indices.
  private eqCap = 0;
  private eqState!: Uint8Array;
  private eqDegree!: Uint32Array;
  private eqIdx!: Uint32Array;
  private readonly eqChunks: BlockBuffer[] = [];
  private readonly eqFreeIds: number[] = [];
  private eqNext = 0;
  private liveEqs = 0;
  private readonly pendingFree: number[] = [];

  // Solved Blocks whose equations have not been reduced yet (peeling work stack).
  private stack!: Uint32Array;
  private stackLen = 0;
  private solvedBits!: Uint32Array;

  // Dense store: K-bit rows plus payload, used only by Gaussian elimination.
  private nw = 0;
  private denseCap = 0;
  private denseBits!: Uint32Array;
  private denseFolded!: Uint32Array;
  private densePayload!: BlockBuffer;
  private denseLeft!: Uint32Array;
  private denseUsed!: Uint8Array;
  private readonly denseFreeSlots: number[] = [];
  private denseCount = 0;
  private rowScratch!: Uint32Array;
  private rowsAdded = 0;
  private nextGaussAt = 0;

  // Completion.
  private failure: ErrorCode = "HASH_MISMATCH";
  private decoded: DecodedFile | undefined;

  // Adjacency: per Block a linked list of edges to the equations that contain it.
  private head!: Int32Array;
  private edgeEq = new Int32Array(1024);
  private edgeNext = new Int32Array(1024);
  private edgeFree = -1;
  private edgeTop = 0;

  constructor(options: unknown, format: FormatParams, hooks: DecoderHooks) {
    const o: Record<string, unknown> = options === undefined ? {} : assertObject("options", options);
    this.hash = o["hash"] === undefined ? sha256WebCrypto : assertFunction<HashFn>("hash", o["hash"]);
    this.limits = {
      maxPayloadBytes: o["maxPayloadBytes"] === undefined ? DEFAULT_MAX_PAYLOAD_BYTES : validateMaxPayloadBytes(o["maxPayloadBytes"]),
      maxBlockCount: o["maxBlockCount"] === undefined ? DEFAULT_MAX_BLOCK_COUNT : validateMaxBlockCount(o["maxBlockCount"]),
    };
    this.maxGauss = o["maxGaussianBlocks"] === undefined ? DEFAULT_MAX_GAUSSIAN_BLOCKS : validateMaxGaussianBlocks(o["maxGaussianBlocks"]);
    this.format = format;
    this.hooks = hooks;
  }

  push(packet: Uint8Array): Promise<PushStatus> {
    const run = this.chain.then(() => this.pushInner(packet));
    this.chain = run.catch(() => undefined);
    return run;
  }

  progress(): Progress {
    return {
      solvedBlocks: this.solvedCount,
      totalBlocks: this.K,
      distinctPackets: this.seen.size,
      complete: this.phase === "complete",
    };
  }

  result(): DecodedFile {
    if (this.phase !== "complete" || this.decoded === undefined) {
      throw new CodecError("INCOMPLETE_DECODE", "decode is not complete");
    }
    return this.decoded;
  }

  /** Test hook: a copy of solved Block i, or undefined while it is unsolved. */
  peekBlock(i: number): Uint8Array | undefined {
    return this.solved[i] === 1 ? this.blocks.block(i).slice() : undefined;
  }

  debug(): DecoderDebug {
    return {
      phase: this.phase,
      liveEquations: this.liveEqs,
      equationCapacity: this.eqCap,
      seen: this.seen.size,
      solved: this.solved ? Array.from(this.solved) : [],
      denseStored: this.denseCount,
      denseCapacity: this.denseCap,
    };
  }

  private accepted(): PushStatus {
    return { kind: "accepted", progress: this.progress() };
  }
  private ignored(reason: IgnoreReason): PushStatus {
    return { kind: "ignored", reason, progress: this.progress() };
  }
  private rejected(code: ErrorCode): PushStatus {
    return { kind: "rejected", code, progress: this.progress() };
  }

  private async pushInner(packet: Uint8Array): Promise<PushStatus> {
    validatePacketBytes(packet);
    if (this.phase === "failed") return this.rejected(this.failure);
    let f: PacketFields;
    try {
      f = decodePacket(packet, this.limits);
    } catch (e) {
      if (e instanceof CodecError) return this.rejected(e.code);
      throw e;
    }
    if (this.phase === "complete") return this.ignored("ALREADY_COMPLETE");
    if (this.phase === "idle") this.startSession(f);
    else if (f.sessionId !== this.sessionId) return this.ignored("SESSION_MISMATCH");
    else if (f.totalLength !== this.L || f.blockSize !== this.bs || f.blockCount !== this.K) return this.rejected("BAD_HEADER");
    if (this.seen.has(f.seq)) return this.ignored("DUPLICATE_PACKET");

    if (f.seq >= this.K && this.neighbors.isDense(f.seq)) {
      if (this.acceptDense(f) === "full") return this.ignored("DENSE_STORE_FULL");
    } else {
      this.seen.add(f.seq);
      this.acceptSparse(f);
      this.drain();
    }
    this.maybeGauss();
    if (this.solvedCount === this.K) return this.finish();
    return this.accepted();
  }

  private startSession(f: PacketFields): void {
    this.phase = "collecting";
    this.sessionId = f.sessionId;
    this.L = f.totalLength;
    this.bs = f.blockSize;
    this.K = f.blockCount;
    const K = this.K;
    this.blocks = new BlockBuffer(K, this.bs);
    this.solved = new Uint8Array(K);
    this.neighbors = new Neighbors(K, getSolitonTable(K, this.format), this.format.D);
    this.scratch = new BlockBuffer(1, this.bs);
    this.setBuf = new Uint32Array(K);
    this.unsolvedBuf = new Uint32Array(K);
    this.stack = new Uint32Array(K);
    this.nw = rowWords(K);
    this.solvedBits = new Uint32Array(this.nw);
    this.rowScratch = new Uint32Array(this.nw);
    if (this.format.D > 0) {
      const cap = maxDenseRows(this.maxGauss);
      this.denseCap = cap;
      this.denseBits = new Uint32Array(cap * this.nw);
      this.denseFolded = new Uint32Array(cap * this.nw);
      this.densePayload = new BlockBuffer(cap, this.bs);
      this.denseLeft = new Uint32Array(cap);
      this.denseUsed = new Uint8Array(cap);
      for (let i = cap - 1; i >= 0; i--) this.denseFreeSlots.push(i);
    }
    this.eqCap = 2 * K + 64;
    this.eqState = new Uint8Array(this.eqCap);
    this.eqDegree = new Uint32Array(this.eqCap);
    this.eqIdx = new Uint32Array(this.eqCap);
    this.head = new Int32Array(K).fill(-1);
  }

  /** Systematic and sparse packets: reduce by solved Blocks, then solve, discard or store. */
  private acceptSparse(f: PacketFields): void {
    const n = this.neighbors.select(this.sessionId, f.seq, this.setBuf);
    const { scratch, blocks, solved, unsolvedBuf } = this;
    scratch.clear(0);
    scratch.block(0).set(f.payload);
    let degree = 0;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const b = this.setBuf[i] as number;
      if (solved[b] === 1) {
        xorBlock(scratch, 0, blocks, b);
      } else {
        unsolvedBuf[degree++] = b;
        idx ^= b;
      }
    }
    if (degree === 0) return;
    if (degree === 1) {
      this.markSolved(idx, scratch, 0);
      return;
    }
    if (this.liveEqs >= this.eqCap) return; // bound reached: counted as distinct, value dropped
    const id = this.allocEq();
    copyBlock(this.eqBuf(id), id % CHUNK, scratch, 0);
    this.eqDegree[id] = degree;
    this.eqIdx[id] = idx;
    this.eqState[id] = LIVE;
    this.liveEqs++;
    this.rowsAdded++;
    for (let i = 0; i < degree; i++) this.addEdge(unsolvedBuf[i] as number, id);
  }

  /**
   * Gaussian elimination on the residual. Runs when peeling has stalled, the unsolved count U is at
   * most maxGaussianBlocks, there are at least U stored rows (sparse equations plus dense rows),
   * and the retry backoff allows it. Above the cap the decoder just keeps collecting.
   */
  private maybeGauss(): void {
    const U = this.K - this.solvedCount;
    if (U === 0 || U > this.maxGauss) return;
    const R = this.liveEqs + this.denseCount;
    if (R < U || this.rowsAdded < this.nextGaussAt) return;
    this.hooks.onGauss?.({ rows: R, unsolved: U });

    this.foldDense();
    const W = (U + 31) >>> 5;
    const colOf = new Int32Array(this.K).fill(-1);
    const cols = new Uint32Array(U);
    let u = 0;
    for (let b = 0; b < this.K; b++) {
      if (this.solved[b] === 0) {
        colOf[b] = u;
        cols[u++] = b;
      }
    }
    const bits = new Uint32Array(R * W);
    const rowId = new Int32Array(R); // equation id, or -1 - slot for a dense row
    const eqRow = new Int32Array(this.eqNext).fill(-1);
    let r = 0;
    for (let id = 0; id < this.eqNext; id++) {
      if (this.eqState[id] === LIVE) {
        eqRow[id] = r;
        rowId[r++] = id;
      }
    }
    for (let slot = 0; slot < this.denseCap; slot++) {
      if (this.denseUsed[slot] === 1) rowId[r++] = -1 - slot;
    }
    for (let c = 0; c < U; c++) {
      let e = this.head[cols[c] as number] as number;
      while (e >= 0) {
        const row = eqRow[this.edgeEq[e] as number] as number;
        if (row >= 0) bits[row * W + (c >>> 5)] = (bits[row * W + (c >>> 5)] as number) | (1 << (c & 31));
        e = this.edgeNext[e] as number;
      }
    }
    for (let row = this.liveEqs; row < R; row++) {
      const slot = -1 - (rowId[row] as number);
      for (let c = 0; c < U; c++) {
        const b = cols[c] as number;
        if (((this.denseBits[slot * this.nw + (b >>> 5)] as number) >>> (b & 31)) & 1) {
          bits[row * W + (c >>> 5)] = (bits[row * W + (c >>> 5)] as number) | (1 << (c & 31));
        }
      }
    }

    const { rank, pivotRow } = findPivots(bits, R, U);
    if (rank < U) {
      this.nextGaussAt = this.rowsAdded + Math.max(1, U - rank);
      return;
    }
    const m = new Uint32Array(U * W);
    const values = new BlockBuffer(U, this.bs);
    for (let c = 0; c < U; c++) {
      const row = pivotRow[c] as number;
      m.set(bits.subarray(row * W, (row + 1) * W), c * W);
      const id = rowId[row] as number;
      if (id >= 0) copyBlock(values, c, this.eqBuf(id), id % CHUNK);
      else copyBlock(values, c, this.densePayload, -1 - id);
    }
    const ord = solveSquare(m, U, values);
    for (let c = 0; c < U; c++) this.markSolved(cols[c] as number, values, ord[c] as number);
    this.drain();
  }

  /** All Blocks are solved: assemble, parse the record, then verify length and SHA-256 before exposing bytes. */
  private async finish(): Promise<PushStatus> {
    if (this.phase !== "collecting") return this.accepted();
    this.phase = "verifying";
    let meta: Metadata;
    let payload: Uint8Array;
    try {
      const stream = new Uint8Array(this.L);
      for (let i = 0; i < this.K; i++) {
        stream.set(this.blocks.block(i).subarray(0, Math.min(this.bs, this.L - i * this.bs)), i * this.bs);
      }
      const recordLength = readRecordLength(stream);
      meta = parseMetadata(stream.subarray(0, recordLength));
      payload = stream.subarray(recordLength);
    } catch (e) {
      if (e instanceof CodecError) return this.fail(e.code);
      throw e;
    }
    if (payload.length !== meta.byteLength) return this.fail("HASH_MISMATCH");
    let digest: Uint8Array;
    try {
      digest = await computeDigest(this.hash, payload);
    } catch (e) {
      this.phase = "collecting"; // a failing hash function is not a verdict on the data; a later push retries
      throw e;
    }
    for (let i = 0; i < digest.length; i++) {
      if (digest[i] !== meta.sha256[i]) return this.fail("HASH_MISMATCH");
    }
    this.decoded = { payload, metadata: meta };
    this.phase = "complete";
    return this.accepted();
  }

  private fail(code: ErrorCode): PushStatus {
    this.phase = "failed";
    this.failure = code;
    return this.rejected(code);
  }

  private markSolved(b: number, src: BlockBuffer, si: number): void {
    copyBlock(this.blocks, b, src, si);
    this.solved[b] = 1;
    this.solvedCount++;
    this.stack[this.stackLen++] = b;
    this.solvedBits[b >>> 5] = (this.solvedBits[b >>> 5] as number) | (1 << (b & 31));
    if (this.denseCount > 0) this.dropSolvedDense(b);
  }

  /**
   * Dense Packets never touch adjacency or the ripple. A Dense_Row is stored as a K-bit row plus
   * payload and is used only by Gaussian elimination.
   */
  private acceptDense(f: PacketFields): "full" | "ok" {
    if (this.denseCount >= this.denseCap) return "full";
    this.seen.add(f.seq);
    const { nw, rowScratch, solvedBits } = this;
    this.neighbors.denseRow(this.sessionId, f.seq, rowScratch);
    let left = 0;
    for (let w = 0; w < nw; w++) left += popcount((rowScratch[w] as number) & ~(solvedBits[w] as number));
    if (left === 0) return "ok"; // every column is already known: nothing to keep
    const slot = this.denseFreeSlots.pop() as number;
    this.denseBits.set(rowScratch, slot * nw);
    this.denseFolded.fill(0, slot * nw, (slot + 1) * nw);
    this.densePayload.clear(slot);
    this.densePayload.block(slot).set(f.payload);
    this.denseLeft[slot] = left;
    this.denseUsed[slot] = 1;
    this.denseCount++;
    this.rowsAdded++;
    return "ok";
  }

  /** Block b was solved: rows with bit b lose a column; a row with no unsolved column is discarded. */
  private dropSolvedDense(b: number): void {
    const word = b >>> 5;
    const mask = 1 << (b & 31);
    for (let slot = 0; slot < this.denseCap; slot++) {
      if (this.denseUsed[slot] !== 1) continue;
      if (((this.denseBits[slot * this.nw + word] as number) & mask) === 0) continue;
      const left = (this.denseLeft[slot] as number) - 1;
      this.denseLeft[slot] = left;
      if (left === 0) this.freeDense(slot);
    }
  }

  private freeDense(slot: number): void {
    this.denseUsed[slot] = 0;
    this.denseFreeSlots.push(slot);
    this.denseCount--;
  }

  /** XOR each newly solved Block of the row into its payload, once, and remember which columns are folded. */
  private foldRow(slot: number): void {
    const base = slot * this.nw;
    for (let w = 0; w < this.nw; w++) {
      const bits = this.denseBits[base + w] as number;
      const known = bits & (this.solvedBits[w] as number);
      let need = known & ~(this.denseFolded[base + w] as number);
      while (need !== 0) {
        const low = need & -need;
        const c = (w << 5) + (31 - Math.clz32(low));
        xorBlock(this.densePayload, slot, this.blocks, c);
        need ^= low;
      }
      this.denseFolded[base + w] = known >>> 0;
    }
  }

  foldDense(): void {
    for (let slot = 0; slot < this.denseCap; slot++) if (this.denseUsed[slot] === 1) this.foldRow(slot);
  }

  denseRows(): DenseRowInfo[] {
    const out: DenseRowInfo[] = [];
    for (let slot = 0; slot < this.denseCap; slot++) {
      if (this.denseUsed[slot] !== 1) continue;
      const columns: number[] = [];
      const folded: number[] = [];
      for (let c = 0; c < this.K; c++) {
        const w = slot * this.nw + (c >>> 5);
        if (((this.denseBits[w] as number) >>> (c & 31)) & 1) columns.push(c);
        if (((this.denseFolded[w] as number) >>> (c & 31)) & 1) folded.push(c);
      }
      out.push({ columns, folded, payload: this.densePayload.block(slot).slice() });
    }
    return out;
  }

  /**
   * Peeling: reduce every equation touching a newly solved Block. An equation that drops to degree 1
   * solves its last Block, which is queued in turn. Equations that reach degree 0 are discarded.
   */
  private drain(): void {
    while (this.stackLen > 0) {
      const b = this.stack[--this.stackLen] as number;
      let e = this.head[b] as number;
      this.head[b] = -1;
      while (e >= 0) {
        const next = this.edgeNext[e] as number;
        const eq = this.edgeEq[e] as number;
        this.edgeNext[e] = this.edgeFree;
        this.edgeFree = e;
        if (this.eqState[eq] === LIVE) {
          const buf = this.eqBuf(eq);
          xorBlock(buf, eq % CHUNK, this.blocks, b);
          this.eqIdx[eq] = (this.eqIdx[eq] as number) ^ b;
          const degree = (this.eqDegree[eq] as number) - 1;
          this.eqDegree[eq] = degree;
          if (degree === 0) {
            this.kill(eq);
          } else if (degree === 1) {
            const c = this.eqIdx[eq] as number;
            if (this.solved[c] === 0) this.markSolved(c, buf, eq % CHUNK);
            this.kill(eq);
          }
        }
        e = next;
      }
    }
    // Ids are recycled only after every list that may still hold a stale edge has been walked.
    for (const id of this.pendingFree) {
      this.eqState[id] = FREE;
      this.eqFreeIds.push(id);
    }
    this.pendingFree.length = 0;
  }

  private kill(eq: number): void {
    this.eqState[eq] = DEAD;
    this.liveEqs--;
    this.pendingFree.push(eq);
  }

  private allocEq(): number {
    const reused = this.eqFreeIds.pop();
    return reused === undefined ? this.eqNext++ : reused;
  }

  private eqBuf(id: number): BlockBuffer {
    const c = id >>> 6;
    while (this.eqChunks.length <= c) this.eqChunks.push(new BlockBuffer(CHUNK, this.bs));
    return this.eqChunks[c] as BlockBuffer;
  }

  private addEdge(block: number, eq: number): void {
    let e: number;
    if (this.edgeFree >= 0) {
      e = this.edgeFree;
      this.edgeFree = this.edgeNext[e] as number;
    } else {
      if (this.edgeTop === this.edgeEq.length) this.growEdges();
      e = this.edgeTop++;
    }
    this.edgeEq[e] = eq;
    this.edgeNext[e] = this.head[block] as number;
    this.head[block] = e;
  }

  private growEdges(): void {
    const n = this.edgeEq.length * 2;
    const eq = new Int32Array(n);
    const nx = new Int32Array(n);
    eq.set(this.edgeEq);
    nx.set(this.edgeNext);
    this.edgeEq = eq;
    this.edgeNext = nx;
  }
}

function popcount(x: number): number {
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

export function createDecoder(options?: DecoderOptions): Decoder {
  return new DecoderImpl(options, DEFAULT_FORMAT, {});
}

/** createDecoder with internal overrides (format constants, hooks, debug view). */
export function createDecoderWith(options: unknown, format: FormatParams = DEFAULT_FORMAT, hooks: DecoderHooks = {}): InternalDecoder {
  return new DecoderImpl(options, format, hooks);
}
