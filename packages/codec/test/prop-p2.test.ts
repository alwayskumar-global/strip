import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { lcgBytes, shuffleWith } from "./prop-helpers.js";

describe("Property 2", () => {
  // Feature: codec, Property 2: completion with any cap, ALREADY_COMPLETE leaves state deep-equal
  // Validates: Requirements 5.8, 5.9, 5.15, 5.16, 5.17
  it("Feature: codec, Property 2: completion with any cap, ALREADY_COMPLETE leaves state deep-equal", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ cap: fc.integer({ min: 0, max: 10 }), K: fc.integer({ min: 20, max: 60 }), slack: fc.integer({ min: 0, max: 31 }), seed: fc.integer(), shuffleSeed: fc.integer(), dropSeed: fc.integer() }),
        async (r) => {
          const len = r.K * 32 - 41 - r.slack; // name "a", empty MIME: L = 41 + len, so K blocks of 32
          const bytes = lcgBytes(len, r.seed);
          const e = await encodeWith({ bytes, name: "a", mime: "" }, { packetSize: 62 }, { format: DEFAULT_FORMAT });
          expect(e.K).toBe(r.K);
          const sys = Array.from({ length: e.K }, () => e.next());
          const repair = Array.from({ length: 12 * e.K }, () => e.next());
          // loss-free for repair packets, about 30% of the systematic packets missing
          const dropFlags = shuffleWith(sys.map((_, i) => i), r.dropSeed);
          const dropped = new Set(dropFlags.slice(0, Math.floor(e.K * 0.3)));
          const set = [...sys.filter((_, i) => !dropped.has(i)), ...repair];
          const d = createDecoderWith({ maxGaussianBlocks: r.cap }, DEFAULT_FORMAT);
          let pushed = 0;
          for (const p of shuffleWith(set, r.shuffleSeed)) {
            const s = await d.push(p);
            pushed++;
            expect(s.kind).not.toBe("rejected"); // exceeding the cap is never an error
            if (s.progress.complete) break;
          }
          expect(d.progress().complete).toBe(true);
          expect(pushed).toBeLessThanOrEqual(set.length);
          expect(d.result().payload).toEqual(bytes);
          // after completion: valid packets are ignored and nothing changes
          const before = { p: d.progress(), dbg: d.debug() };
          for (const extra of [sys[0] as Uint8Array, repair[0] as Uint8Array]) {
            expect(await d.push(extra)).toMatchObject({ kind: "ignored", reason: "ALREADY_COMPLETE" });
          }
          expect(d.progress()).toEqual(before.p);
          expect(d.debug()).toEqual(before.dbg);
        },
      ),
      { numRuns: 200 },
    );
  }, 600000);
});
