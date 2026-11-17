// Dense packet performance (R8.7). Asserted: dense next() at K = 359 (1 MiB, default packetSize) has a median
// below 20 ms over 20 timed runs after 3 warm-ups. Informational: per dense packet at K = 11,480 (32 MiB), and
// the lazy dense folding and the elimination push at K = 11,480 with a full dense store.
//   pnpm --filter @strip/codec perf:dense     (writes perf/out/dense-perf.txt)
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { encode } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { isDense } from "../src/neighbors.js";
import { decodePacket } from "../src/packet.js";
import { Prng } from "../src/prng.js";
import { measureDenseNext, ONE_MIB, renderDenseCost, THIRTY_TWO_MIB_PAYLOAD } from "./dense-cost.js";

const BUDGET_MS = 20;
const lines: string[] = [];
const log = (l: string): void => {
  lines.push(l);
  process.stdout.write(l + "\n");
};
const ms = (t0: bigint): number => Number(process.hrtime.bigint() - t0) / 1e6;

it("dense packet performance (R8.7)", async () => {
  const D = DEFAULT_FORMAT.D;
  const small = await measureDenseNext(ONE_MIB, D);
  log(renderDenseCost(small, "1 MiB") + `; budget < ${BUDGET_MS} ms`);
  const big = await measureDenseNext(THIRTY_TWO_MIB_PAYLOAD, D);
  log(renderDenseCost(big, "32 MiB (informational)"));

  // Lazy folding at K = 11,480 with a full dense store, then the push that triggers elimination.
  const rng = new Prng(0x1d3, 7);
  const bytes = Uint8Array.from({ length: THIRTY_TWO_MIB_PAYLOAD }, () => rng.next() >>> 24);
  const e = await encode({ bytes, name: "fold.bin", mime: "" });
  const K = e.K;
  const sys = Array.from({ length: K }, () => e.next());
  const dropped: number[] = [];
  for (let i = 0; dropped.length < 1100; i += 10) dropped.push(i); // U = 1100, just above maxGaussianBlocks = 1024
  const droppedSet = new Set(dropped);
  const d = createDecoderWith({}, DEFAULT_FORMAT);
  for (let i = 0; i < K; i++) if (!droppedSet.has(i)) await d.push(sys[i] as Uint8Array);
  let denseSent = 0;
  while (d.debug().denseStored < d.debug().denseCapacity) {
    const p = e.next();
    if (isDense(decodePacket(p).seq, K, D)) {
      await d.push(p);
      denseSent++;
    }
  }
  const stored = d.debug().denseStored;
  const t0 = process.hrtime.bigint();
  d.foldDense();
  const foldMs = ms(t0);
  log(`lazy dense folding at K = ${K}: ${stored} stored dense rows (store full, ${denseSent} dense packets sent), U = ${dropped.length} unsolved (just above the cap, so no elimination interferes): ${foldMs.toFixed(0)} ms for one full fold (one run, informational)`);

  // Bring U to 1000: the push that crosses the cap triggers elimination (fold, rank, solve).
  let slowest = 0;
  const t1 = process.hrtime.bigint();
  for (const i of dropped.slice(0, 100)) {
    const t = process.hrtime.bigint();
    await d.push(sys[i] as Uint8Array);
    slowest = Math.max(slowest, ms(t));
  }
  log(`pushing 100 more systematic packets (U 1100 -> 1000): total ${ms(t1).toFixed(0)} ms, slowest single push ${slowest.toFixed(0)} ms (includes the elimination: fold, rank, solve); complete=${d.progress().complete} (one run, informational)`);

  mkdirSync(`${process.cwd()}/perf/out`, { recursive: true });
  writeFileSync(`${process.cwd()}/perf/out/dense-perf.txt`, lines.join("\n") + "\n");
  expect(small?.medianMs, `dense next() median ${small?.medianMs.toFixed(3)} ms vs budget ${BUDGET_MS} ms`).toBeLessThan(BUDGET_MS);
}, 3600 * 1000);
