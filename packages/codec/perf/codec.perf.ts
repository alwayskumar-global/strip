// Formal performance measurements (R8): 3 discarded warm-ups, 20 timed runs, process.hrtime.bigint, the same
// seeded input every run. Budgets (asserted): encode 1 MiB < 200 ms; decode < 500 ms for fixture (a) the K
// systematic packets and fixture (b) ceil(f_late x K) seeded random repair packets. 32 MiB is informational.
//   pnpm --filter @strip/codec perf:codec     (writes perf/out/codec-perf.txt)
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { expect, it } from "vitest";
import { createDecoder, encode } from "../src/index.js";
import { lateCount } from "../src/overhead.js";
import { Prng } from "../src/prng.js";
import { ONE_MIB, THIRTY_TWO_MIB_PAYLOAD } from "./dense-cost.js";

const WARMUPS = 3;
const RUNS = 20;
const BUDGET_ENCODE_MS = 200;
const BUDGET_DECODE_MS = 500;
const lines: string[] = [];
const log = (l: string): void => {
  lines.push(l);
  process.stdout.write(l + "\n");
};

const ms = (t0: bigint): number => Number(process.hrtime.bigint() - t0) / 1e6;

interface Stats {
  readonly median: number;
  readonly p95: number;
  readonly min: number;
  readonly max: number;
}

async function timeRuns(fn: () => Promise<void>): Promise<Stats> {
  for (let i = 0; i < WARMUPS; i++) await fn();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = process.hrtime.bigint();
    await fn();
    times.push(ms(t0));
  }
  const s = [...times].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { median: ((s[mid - 1] as number) + (s[mid] as number)) / 2, p95: s[18] as number, min: s[0] as number, max: s[19] as number };
}

const fmt = (s: Stats): string => `median ${s.median.toFixed(1)} ms, p95 ${s.p95.toFixed(1)} ms (min ${s.min.toFixed(1)}, max ${s.max.toFixed(1)}; 3 warm-ups, 20 timed runs)`;

function seededBytes(n: number, seed: number): Uint8Array {
  const rng = new Prng(seed, 1);
  return Uint8Array.from({ length: n }, () => rng.next() >>> 24);
}

const same = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

it("codec performance (R8)", async () => {
  log(`node ${process.version}; ${cpus()[0]?.model ?? "unknown cpu"}`);
  const bytes = seededBytes(ONE_MIB, 0x9e7f);
  const payload = { bytes, name: "perf.bin", mime: "application/octet-stream" };

  // Encode: SHA-256, framing, CRC and the K systematic packets.
  let K = 0;
  const encodeStats = await timeRuns(async () => {
    const e = await encode(payload);
    K = e.K;
    for (let i = 0; i < e.K; i++) e.next();
  });
  log(`encode 1 MiB (K = ${K}) -> K systematic packets: ${fmt(encodeStats)}; budget < ${BUDGET_ENCODE_MS} ms`);

  // Fixtures, built once outside the timed region.
  const enc = await encode(payload);
  const systematic = Array.from({ length: enc.K }, () => enc.next());
  const pool = Array.from({ length: 4 * enc.K }, () => enc.next()); // repair seq K..5K-1
  const order = pool.map((_, i) => i);
  const rng = new Prng(0xfeed, 2);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.bounded(i + 1);
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const size = lateCount(enc.K);
  const lateSet = order.slice(0, size).map((i) => pool[i] as Uint8Array);

  const decodeRun = (packets: readonly Uint8Array[]) => async () => {
    const d = createDecoder();
    for (const p of packets) await d.push(p);
    expect(d.progress().complete).toBe(true);
    expect(same(d.result().payload, bytes)).toBe(true);
  };
  const decA = await timeRuns(decodeRun(systematic));
  log(`decode (a) K = ${enc.K} systematic packets: ${fmt(decA)}; budget < ${BUDGET_DECODE_MS} ms`);
  const decB = await timeRuns(decodeRun(lateSet));
  log(`decode (b) ${size} seeded random repair packets (ceil(f_late x K), pool seq K..5K-1): ${fmt(decB)}; budget < ${BUDGET_DECODE_MS} ms`);

  // 32 MiB: informational, one run each, no assertion.
  const big = seededBytes(THIRTY_TWO_MIB_PAYLOAD, 0x5eed);
  let t0 = process.hrtime.bigint();
  const be = await encode({ bytes: big, name: "big.bin", mime: "" });
  const bigSys = Array.from({ length: be.K }, () => be.next());
  log(`32 MiB (K = ${be.K}) encode + K systematic packets: ${ms(t0).toFixed(0)} ms (one run, informational)`);
  const bd = createDecoder();
  t0 = process.hrtime.bigint();
  for (const p of bigSys) await bd.push(p);
  log(`32 MiB decode (a) K systematic packets: ${ms(t0).toFixed(0)} ms, complete=${bd.progress().complete} (one run, informational)`);
  const bigLate = lateCount(be.K);
  const bigRepair = Array.from({ length: bigLate }, () => be.next());
  const bd2 = createDecoder();
  t0 = process.hrtime.bigint();
  for (const p of bigRepair) await bd2.push(p);
  log(`32 MiB decode (b) ${bigLate} repair packets in stream order (seq K..): ${ms(t0).toFixed(0)} ms, complete=${bd2.progress().complete} (one run, informational)`);

  mkdirSync(`${process.cwd()}/perf/out`, { recursive: true });
  writeFileSync(`${process.cwd()}/perf/out/codec-perf.txt`, lines.join("\n") + "\n");

  // Assertions last, so every measurement is reported even when a budget is missed.
  expect(encodeStats.median, `encode median ${encodeStats.median.toFixed(1)} ms vs budget ${BUDGET_ENCODE_MS} ms`).toBeLessThan(BUDGET_ENCODE_MS);
  expect(decA.median, `decode (a) median ${decA.median.toFixed(1)} ms vs budget ${BUDGET_DECODE_MS} ms`).toBeLessThan(BUDGET_DECODE_MS);
  expect(decB.median, `decode (b) median ${decB.median.toFixed(1)} ms vs budget ${BUDGET_DECODE_MS} ms (R8.6: stop and report)`).toBeLessThan(BUDGET_DECODE_MS);
}, 3600 * 1000);
