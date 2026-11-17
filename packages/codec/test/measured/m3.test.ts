import { describe, expect, it } from "vitest";
import { LOSS_05 } from "../../perf/calibrate.js";
import { R } from "../../src/overhead.js";
import { Prng } from "../../src/prng.js";
import { LOSS_02, LOSS_10, makeTrial, MEASURED_KS, MEASURED_N, newDecoder, report, sameBytes, THRESHOLD, trialSeeds } from "./helpers.js";

async function pageSuccesses(K: number, fcSeed: number, loss: number, salt: number): Promise<number> {
  let ok = 0;
  for (const seed of trialSeeds(fcSeed, MEASURED_N)) {
    const t = await makeTrial(K, seed);
    const page = t.enc.page(); // default repairCount R(K), so T = K + R(K) packets
    const rng = new Prng(seed, salt);
    const d = newDecoder();
    for (const p of page) {
      if (rng.next() < loss) continue;
      await d.push(p);
    }
    if (d.progress().complete && sameBytes(d.result().payload, t.bytes)) ok++;
  }
  return ok;
}

describe("Property M3", () => {
  // Feature: codec, Property M3: default page completes under 5% loss
  // Validates: Requirements 4.7, 2.9, 10.6, 10.7
  for (const K of MEASURED_KS) {
    it(`Feature: codec, Property M3: default page completes under 5% loss (K = ${K})`, async () => {
      const ok = await pageSuccesses(K, 0x4d33, LOSS_05, 3);
      process.stdout.write(report("M3", K, `R=${R(K)} T=${K + R(K)} loss=0.05`, MEASURED_N, ok) + "\n");
      // informational only, no assertion
      const ok02 = await pageSuccesses(K, 0x4d33, LOSS_02, 4);
      const ok10 = await pageSuccesses(K, 0x4d33, LOSS_10, 5);
      process.stdout.write(report("M3-info", K, "loss=0.02", MEASURED_N, ok02) + "\n");
      process.stdout.write(report("M3-info", K, "loss=0.10", MEASURED_N, ok10) + "\n");
      expect(ok / MEASURED_N).toBeGreaterThanOrEqual(THRESHOLD);
    }, 3600 * 1000);
  }
});
