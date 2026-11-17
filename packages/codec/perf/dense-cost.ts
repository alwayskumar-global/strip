// Cost of producing one Dense_Packet with next(): 3 discarded warm-ups, 20 timed runs, process.hrtime.bigint.
// Median and p95 (the 19th of 20 ascending values), plus the Node version and CPU model.
import { cpus } from "node:os";
import { DEFAULT_FORMAT } from "../src/format.js";
import { encodeWith } from "../src/encoder.js";
import { isDense } from "../src/neighbors.js";
import { Prng } from "../src/prng.js";

export interface DenseCost {
  readonly K: number;
  readonly D: number;
  readonly payloadBytes: number;
  readonly medianMs: number;
  readonly p95Ms: number;
  readonly runsMs: readonly number[];
  readonly node: string;
  readonly cpu: string;
}

export const ONE_MIB = 1024 * 1024;
/** Largest payload whose coded stream (payload + 41-byte record for this name) stays within 32 MiB. */
export const THIRTY_TWO_MIB_PAYLOAD = 32 * ONE_MIB - 64;

export async function measureDenseNext(payloadBytes: number, D: number, warmups = 3, runs = 20): Promise<DenseCost | null> {
  if (D <= 0) return null;
  const rng = new Prng(0xd3115e, payloadBytes >>> 0);
  const bytes = Uint8Array.from({ length: payloadBytes }, () => rng.next() >>> 24);
  const format = { ...DEFAULT_FORMAT, D };
  const enc = await encodeWith({ bytes, name: "dense.bin", mime: "" }, undefined, { format });
  const K = enc.K;
  const times: number[] = [];
  let seq = 0;
  while (times.length < runs + warmups) {
    const dense = isDense(seq, K, D);
    if (dense) {
      const t0 = process.hrtime.bigint();
      enc.next();
      const dt = process.hrtime.bigint() - t0;
      times.push(Number(dt) / 1e6);
    } else {
      enc.next();
    }
    seq++;
  }
  const timed = times.slice(warmups);
  const sorted = [...timed].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const medianMs = sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
  return {
    K,
    D,
    payloadBytes,
    medianMs,
    p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)] as number,
    runsMs: timed,
    node: process.version,
    cpu: cpus()[0]?.model ?? "unknown",
  };
}

export function renderDenseCost(c: DenseCost | null, label: string): string {
  if (c === null) return `${label}: no dense packets (D = none)`;
  return `${label}: K=${c.K} D=${c.D} dense next() median ${c.medianMs.toFixed(3)} ms, p95 ${c.p95Ms.toFixed(3)} ms (20 runs after 3 warm-ups; node ${c.node}; ${c.cpu})`;
}
