import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DENSE_PERIOD } from "../src/constants.js";
import { encode } from "../src/encoder.js";
import { decodePacket } from "../src/packet.js";
import { Prng } from "../src/prng.js";
import { arbSmallCase } from "./prop-helpers.js";

/** Reference for a dense Block set, re-implemented here from the word/bit rule. */
function referenceSet(session: number, seq: number, K: number): number[] {
  const prng = new Prng(session, seq);
  const words = Array.from({ length: Math.ceil(K / 32) }, () => prng.next());
  const set: number[] = [];
  for (let b = 0; b < K; b++) if (((words[b >>> 5] as number) >>> (b & 31)) & 1) set.push(b);
  return set.length > 0 ? set : [seq % K];
}

describe("Property 16", () => {
  // Feature: codec, Property 16: dense Packets are deterministic and match the reference rule
  // Validates: Requirements 6.7, 2.11, 2.12, 2.13
  it("Feature: codec, Property 16: dense Packets are deterministic and match the reference rule", async () => {
    await fc.assert(
      fc.asyncProperty(arbSmallCase, async (c) => {
        const p = { bytes: c.bytes, name: c.name, mime: c.mime };
        const a = await encode(p, { packetSize: c.packetSize });
        const b = await encode(p, { packetSize: c.packetSize });
        const K = a.K;
        const stream = Array.from({ length: K + 4 * DENSE_PERIOD }, () => a.next());
        const again = Array.from({ length: stream.length }, () => b.next());
        const blocks = stream.slice(0, K).map((x) => decodePacket(x).payload);
        let dense = 0;
        stream.forEach((pk, seq) => {
          expect(again[seq]).toEqual(pk); // byte-identical, dense packets included
          if (seq >= K && (seq - K) % DENSE_PERIOD === DENSE_PERIOD - 1) {
            dense++;
            const want = new Uint8Array(a.blockSize);
            for (const idx of referenceSet(a.sessionId, seq, K)) {
              const blk = blocks[idx] as Uint8Array;
              for (let i = 0; i < want.length; i++) want[i] = (want[i] as number) ^ (blk[i] as number);
            }
            expect(decodePacket(pk).payload).toEqual(want);
          }
        });
        expect(dense).toBe(4);
      }),
      { numRuns: 200 },
    );
  }, 600000);
});
