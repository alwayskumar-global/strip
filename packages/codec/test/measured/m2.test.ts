import { describe, expect, it } from "vitest";
import { LOSS_30 } from "../../perf/calibrate.js";
import { coldLimit, fColdPermille } from "../../src/overhead.js";
import { Prng } from "../../src/prng.js";
import { makeTrial, MEASURED_KS, MEASURED_N, newDecoder, report, sameBytes, THRESHOLD, trialSeeds } from "./helpers.js";

describe("Property M2", () => {
  // Feature: codec, Property M2: cold start with 30% loss completes within f_cold x K
  // Validates: Requirements 2.8, 2.9, 10.6, 10.7
  for (const K of MEASURED_KS) {
    it(`Feature: codec, Property M2: cold start with 30% loss completes within f_cold x K (K = ${K})`, async () => {
      const limit = coldLimit(K);
      let ok = 0;
      for (const seed of trialSeeds(0x4d32, MEASURED_N)) {
        const t = await makeTrial(K, seed);
        const loss = new Prng(seed, 2);
        const d = newDecoder();
        let received = 0;
        for (let seq = 0; received < limit; seq++) {
          const pk = t.enc.next();
          if (loss.next() < LOSS_30) continue;
          received++;
          if ((await d.push(pk)).progress.complete) break;
        }
        if (d.progress().complete && sameBytes(d.result().payload, t.bytes)) ok++;
      }
      process.stdout.write(report("M2", K, `f_cold=${(fColdPermille(K) / 1000).toFixed(3)} limit=${limit}`, MEASURED_N, ok) + "\n");
      expect(ok / MEASURED_N).toBeGreaterThanOrEqual(THRESHOLD);
    }, 3600 * 1000);
  }
});
