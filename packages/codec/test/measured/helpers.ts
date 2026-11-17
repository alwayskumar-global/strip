import fc from "fast-check";
import { wilsonLower } from "../../perf/calibrate.js";
import { createDecoderWith } from "../../src/decoder.js";
import { encodeWith, type Encoder } from "../../src/encoder.js";
import { DEFAULT_FORMAT } from "../../src/format.js";
import { Prng } from "../../src/prng.js";

export const MEASURED_KS = [50, 100, 500] as const;
export const MEASURED_N = 1000;
export const THRESHOLD = 0.99;
/** floor(p * 2^32): next() < threshold means the packet is lost. */
export const LOSS_02 = 85899345;
export const LOSS_10 = 429496729;

/** Deterministic trial seeds from a fixed fast-check seed (distinct from the calibration seed 0x5ca11b00). */
export function trialSeeds(fcSeed: number, n: number): number[] {
  return fc.sample(fc.integer({ min: 0, max: 0x7fffffff }), { seed: fcSeed, numRuns: n });
}

export interface Trial {
  readonly enc: Encoder;
  readonly bytes: Uint8Array;
  readonly K: number;
  readonly seed: number;
}

/** A session with exactly K blocks of 32 bytes (packetSize 62); payload and session id vary with the seed. */
export async function makeTrial(K: number, seed: number): Promise<Trial> {
  const rng = new Prng(seed, 0);
  const bytes = Uint8Array.from({ length: K * 32 - 41 }, () => rng.next() >>> 24);
  const enc = await encodeWith({ bytes, name: "a", mime: "" }, { packetSize: 62 }, { format: DEFAULT_FORMAT });
  if (enc.K !== K) throw new Error(`expected K=${K}, got ${enc.K}`);
  return { enc, bytes, K, seed };
}

export function newDecoder() {
  return createDecoderWith({}, DEFAULT_FORMAT);
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function report(name: string, K: number, f: string, N: number, ok: number): string {
  const rate = ok / N;
  return `${name} K=${K} ${f} N=${N} success=${ok} rate=${rate.toFixed(4)} wilson95>=${wilsonLower(ok, N).toFixed(4)}`;
}
