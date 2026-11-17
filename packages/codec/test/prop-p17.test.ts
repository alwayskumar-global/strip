import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder } from "../src/decoder.js";
import { encode } from "../src/encoder.js";
import { sha256WebCrypto } from "../src/hash.js";
const prefix = (d: Uint8Array): string => Array.from(d.subarray(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
describe("Property 17: HASH_MISMATCH digest prefixes", () => {
  // Feature: codec, Property 17: for any payload and any injected hash function that returns a digest differing from the stored one, the rejected status has hashes.expected equal to the first 12 hex digits of the stored digest and hashes.actual equal to the first 12 hex digits of the injected digest, repeats on later pushes, and is absent for every other rejection code and for accepted and ignored statuses
  it("the rejection carries both prefixes, repeats on later pushes, and hashes is absent everywhere else", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 300 }), fc.uint8Array({ minLength: 32, maxLength: 32 }), async (bytes, injected) => {
        const stored = await sha256WebCrypto(bytes);
        fc.pre(prefix(stored) !== prefix(injected) && injected.some((v, i) => v !== stored[i]));
        const e = await encode({ bytes, name: "p.bin", mime: "application/x-test" }, { packetSize: 46 });
        const d = createDecoder({ hash: () => injected.slice() });
        const seen = [];
        for (let i = 0; i < e.K; i++) seen.push(await d.push(e.next()));
        const first = seen[seen.length - 1];
        expect(first).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
        const want = { expected: prefix(stored), actual: prefix(injected) };
        expect((first as { hashes?: unknown }).hashes).toEqual(want);
        for (const s of seen.slice(0, -1)) expect("hashes" in s).toBe(false); // accepted statuses before the verdict
        // every later push returns the same rejection, whatever the packet
        for (const p of [e.next(), new Uint8Array(46)]) {
          const again = await d.push(p);
          expect(again).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
          expect((again as { hashes?: unknown }).hashes).toEqual(want);
        }
        // no full digest anywhere in the status
        expect(JSON.stringify(first)).not.toMatch(/[0-9a-f]{64}/);
        // other rejection codes and ignored statuses carry none
        const fresh = createDecoder();
        const p0 = e.next();
        const dup = [await fresh.push(p0), await fresh.push(p0)];
        const bad = p0.slice();
        bad[bad.length - 1] = (bad[bad.length - 1] as number) ^ 1;
        const crc = await fresh.push(bad);
        for (const s of [...dup, crc]) expect("hashes" in s).toBe(false);
      }),
      { numRuns: 200 },
    );
  }, 300_000);
});
