import { describe, expect, it } from "vitest";
import { fLatePermille, lateCount } from "../../src/overhead.js";
import { Prng } from "../../src/prng.js";
import { makeTrial, MEASURED_KS, MEASURED_N, newDecoder, report, sameBytes, THRESHOLD, trialSeeds } from "./helpers.js";

describe("Property M1", () => {
  // Feature: codec, Property M1: late-join repair-only subsets complete
  // Validates: Requirements 2.7, 2.9, 10.6, 10.7
  for (const K of MEASURED_KS) {
    it(`Feature: codec, Property M1: late-join repair-only subsets complete (K = ${K})`, async () => {
      const size = lateCount(K);
      let ok = 0;
      for (const seed of trialSeeds(0x4d31, MEASURED_N)) {
        const t = await makeTrial(K, seed);
        const pk: Uint8Array[] = [];
        for (let s = 0; s < 5 * K; s++) pk.push(t.enc.next());
        const order: number[] = [];
        for (let s = K; s < 5 * K; s++) order.push(s); // repair packets K..5K-1
        const rng = new Prng(seed, 1);
        for (let i = order.length - 1; i > 0; i--) {
          const j = rng.bounded(i + 1);
          [order[i], order[j]] = [order[j] as number, order[i] as number];
        }
        const d = newDecoder();
        for (const s of order.slice(0, size)) await d.push(pk[s] as Uint8Array);
        if (d.progress().complete && sameBytes(d.result().payload, t.bytes)) ok++;
      }
      process.stdout.write(report("M1", K, `f_late=${(fLatePermille(K) / 1000).toFixed(3)} subset=${size}`, MEASURED_N, ok) + "\n");
      expect(ok / MEASURED_N).toBeGreaterThanOrEqual(THRESHOLD);
    }, 3600 * 1000);
  }
});
