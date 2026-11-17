import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { sha256WebCrypto } from "../src/hash.js";
import { arbSmallCase, lcgBytes, shuffleWith } from "./prop-helpers.js";

describe("Property 9", () => {
  // Feature: codec, Property 9: progress is monotone and complete iff solved and hash verified
  // Validates: Requirements 5.6, 5.10, 5.11
  it("Feature: codec, Property 9: progress is monotone and complete iff solved and hash verified", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSmallCase,
        fc.integer(),
        fc.boolean(),
        fc.array(fc.constantFrom("dup", "foreign", "none"), { maxLength: 60 }),
        async (c, seed, wrongDigest, plan) => {
          const payload = { bytes: c.bytes, name: c.name, mime: c.mime };
          const main = await encodeWith(payload, { packetSize: c.packetSize }, {});
          const other = await encodeWith({ bytes: lcgBytes(c.bytes.length + 3, seed), name: c.name + "y", mime: c.mime }, { packetSize: c.packetSize }, {});
          const calls: number[] = [];
          const hash = wrongDigest
            ? async (d: Uint8Array) => {
                calls.push(d.length);
                return new Uint8Array(32);
              }
            : async (d: Uint8Array) => {
                calls.push(d.length);
                return sha256WebCrypto(d);
              };
          const d = createDecoderWith({ hash }, DEFAULT_FORMAT);
          const set = shuffleWith(Array.from({ length: main.K + 3 }, () => main.next()), seed);
          const seen: Uint8Array[] = [];
          let prev = d.progress();
          const check = (): void => {
            const p = d.progress();
            expect(p.solvedBlocks).toBeGreaterThanOrEqual(prev.solvedBlocks);
            expect(p.distinctPackets).toBeGreaterThanOrEqual(prev.distinctPackets);
            expect(p.solvedBlocks).toBeLessThanOrEqual(Math.max(p.totalBlocks, 0));
            if (p.complete) {
              expect(p.solvedBlocks).toBe(p.totalBlocks);
              expect(calls.length).toBeGreaterThanOrEqual(1);
              expect(calls[0]).toBeGreaterThan(0);
            }
            if (p.solvedBlocks === p.totalBlocks && p.totalBlocks > 0) expect(p.complete).toBe(!wrongDigest);
            if (wrongDigest) expect(p.complete).toBe(false);
            prev = p;
          };
          for (let i = 0; i < set.length; i++) {
            const action = i > 0 ? (plan[i % Math.max(1, plan.length)] ?? "none") : "none";
            if (action === "dup") await d.push(seen[i % seen.length] as Uint8Array);
            else if (action === "foreign") await d.push(other.next());
            check();
            const s = await d.push(set[i] as Uint8Array);
            seen.push(set[i] as Uint8Array);
            check();
            if (wrongDigest && d.progress().solvedBlocks === d.progress().totalBlocks) {
              expect(s).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
              expect(() => d.result()).toThrow();
            }
          }
          if (!wrongDigest) {
            expect(d.progress().complete).toBe(true);
            expect(d.result().payload).toEqual(c.bytes);
            expect(calls.length).toBe(1);
          } else {
            expect(d.progress().complete).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  }, 600000);
});
