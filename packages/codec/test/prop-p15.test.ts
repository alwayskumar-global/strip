import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { crc32 } from "../src/crc32.js";
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { isDense } from "../src/neighbors.js";
import { decodePacket } from "../src/packet.js";
import { lcgBytes, shuffleWith } from "./prop-helpers.js";

describe("Property 15", () => {
  // Feature: codec, Property 15: dense and systematic input never yields wrong bytes
  // Validates: Requirements 5.18, 5.19, 5.20, 5.21, 5.22, 5.23, 5.10, 5.11
  it("Feature: codec, Property 15: dense and systematic input never yields wrong bytes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          K: fc.integer({ min: 5, max: 40 }),
          slack: fc.integer({ min: 0, max: 31 }),
          seed: fc.integer(),
          cap: fc.constantFrom(0, 3, 1024),
          keepSystematic: fc.integer({ min: 0, max: 100 }),
          denseCount: fc.integer({ min: 0, max: 200 }),
          corrupt: fc.integer({ min: 0, max: 100 }),
          shuffleSeed: fc.integer(),
          flipAt: fc.nat(),
        }),
        async (r) => {
          const bytes = lcgBytes(r.K * 32 - 41 - r.slack, r.seed);
          const e = await encodeWith({ bytes, name: "a", mime: "" }, { packetSize: 62 }, { format: DEFAULT_FORMAT });
          const K = e.K;
          const all = Array.from({ length: K + 6 * K + 20 }, () => e.next());
          const pool: Uint8Array[] = [];
          let denseTaken = 0;
          all.forEach((p, i) => {
            const seq = decodePacket(p).seq;
            if (seq < K) {
              if (((i * 37 + r.seed) >>> 0) % 100 < r.keepSystematic) pool.push(p);
            } else if (isDense(seq, K, DEFAULT_FORMAT.D) && denseTaken < r.denseCount) {
              denseTaken++;
              let q = p;
              if (((i * 53 + r.seed) >>> 0) % 100 < r.corrupt) {
                q = p.slice();
                const at = 26 + (r.flipAt % 32);
                q[at] = (q[at] as number) ^ 1;
                // the trailing CRC is recomputed, so the packet is valid on the wire but carries wrong data
                const dv = new DataView(q.buffer);
                dv.setUint32(q.length - 4, crc32(q, 0, q.length - 4));
              }
              pool.push(q);
            }
            // sparse repair packets are withheld: only dense and systematic packets are fed
          });
          const d = createDecoderWith({ maxGaussianBlocks: r.cap }, DEFAULT_FORMAT);
          for (const p of shuffleWith(pool, r.shuffleSeed)) {
            const s = await d.push(p);
            expect(["accepted", "ignored", "rejected"]).toContain(s.kind);
            if (s.progress.complete) expect(d.result().payload).toEqual(bytes);
          }
          const complete = d.progress().complete;
          if (complete) {
            expect(d.result().payload).toEqual(bytes); // completed only with the right bytes
          } else {
            expect(() => d.result()).toThrow(); // and never exposes bytes otherwise (incl. after HASH_MISMATCH)
          }
        },
      ),
      { numRuns: 200 },
    );
  }, 600000);
});
