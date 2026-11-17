import { DEFAULT_MAX_BLOCK_COUNT, DEFAULT_MAX_GAUSSIAN_BLOCKS, DEFAULT_MAX_PAYLOAD_BYTES } from "./constants.js";
import { CodecError, type ErrorCode, type IgnoreReason } from "./errors.js";
import { DEFAULT_FORMAT, type FormatParams } from "./format.js";
import { sha256WebCrypto, type HashFn } from "./hash.js";
import type { Metadata } from "./metadata.js";
import { Neighbors } from "./neighbors.js";
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
  readonly onGauss?: () => void;
}

export interface DecoderDebug {
  readonly phase: string;
  readonly liveEquations: number;
  readonly equationCapacity: number;
  readonly seen: number;
  readonly solved: readonly number[];
}

export interface InternalDecoder extends Decoder {
  debug(): DecoderDebug;
}

type Phase = "idle" | "collecting" | "verifying" | "complete" | "failed";

const LIVE = 1;
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
    throw new CodecError("INCOMPLETE_DECODE", "decode is not complete");
  }

  debug(): DecoderDebug {
    return {
      phase: this.phase,
      liveEquations: this.liveEqs,
      equationCapacity: this.eqCap,
      seen: this.seen.size,
      solved: this.solved ? Array.from(this.solved) : [],
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
    let f: PacketFields;
    try {
      f = decodePacket(packet, this.limits);
    } catch (e) {
      if (e instanceof CodecError) return this.rejected(e.code);
      throw e;
    }
    if (this.phase === "idle") this.startSession(f);
    else if (f.sessionId !== this.sessionId) return this.ignored("SESSION_MISMATCH");
    else if (f.totalLength !== this.L || f.blockSize !== this.bs || f.blockCount !== this.K) return this.rejected("BAD_HEADER");
    if (this.seen.has(f.seq)) return this.ignored("DUPLICATE_PACKET");

    if (f.seq >= this.K && this.neighbors.isDense(f.seq)) {
      this.seen.add(f.seq); // dense path is implemented in task 3.6
      return this.accepted();
    }
    this.seen.add(f.seq);
    this.acceptSparse(f);
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
    for (let i = 0; i < degree; i++) this.addEdge(unsolvedBuf[i] as number, id);
  }

  private markSolved(b: number, src: BlockBuffer, si: number): void {
    copyBlock(this.blocks, b, src, si);
    this.solved[b] = 1;
    this.solvedCount++;
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

export function createDecoder(options?: DecoderOptions): Decoder {
  return new DecoderImpl(options, DEFAULT_FORMAT, {});
}

/** createDecoder with internal overrides (format constants, hooks, debug view). */
export function createDecoderWith(options: unknown, format: FormatParams = DEFAULT_FORMAT, hooks: DecoderHooks = {}): InternalDecoder {
  return new DecoderImpl(options, format, hooks);
}
