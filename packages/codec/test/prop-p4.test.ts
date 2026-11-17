import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { arbSmallCase, lcgBytes, shuffleWith } from "./prop-helpers.js";

describe("Property 4", () => {
  // Feature: codec, Property 4: duplicates and foreign Packets leave state unchanged and the result is correct
  // Validates: Requirements 2.6, 5.3, 5.4
  it("Feature: codec, Property 4: duplicates and foreign Packets leave state unchanged and the result is correct", async () => {
    await fc.assert(
      fc.asyncProperty(arbSmallCase, fc.integer(), fc.array(fc.constantFrom("dup", "foreign", "none"), { minLength: 0, maxLength: 80 }), async (c, seed, plan) => {
        const main = await encodeWith({ bytes: c.bytes, name: c.name, mime: c.mime }, { packetSize: c.packetSize }, {});
        const other = await encodeWith({ bytes: lcgBytes(c.bytes.length + 1, seed), name: c.name + "x", mime: c.mime }, { packetSize: c.packetSize }, {});
        expect(other.sessionId).not.toBe(main.sessionId);
        const order = shuffleWith(Array.from({ length: main.K }, () => main.next()), seed);
        const d = createDecoderWith({}, DEFAULT_FORMAT);
        const pushed: Uint8Array[] = [];
        for (let i = 0; i < order.length; i++) {
          if (i > 0) {
            // interleave extras only before completion and after the session exists
            const action = plan[i % Math.max(1, plan.length)] ?? "none";
            const snap = { p: d.progress(), dbg: d.debug() };
            if (action === "dup") {
              const s = await d.push(pushed[i % pushed.length] as Uint8Array);
              expect(s).toMatchObject({ kind: "ignored", reason: "DUPLICATE_PACKET" });
              expect(d.progress()).toEqual(snap.p);
              expect(d.debug()).toEqual(snap.dbg);
            } else if (action === "foreign") {
              const s = await d.push(other.next());
              expect(s).toMatchObject({ kind: "ignored", reason: "SESSION_MISMATCH" });
              expect(d.progress()).toEqual(snap.p);
              expect(d.debug()).toEqual(snap.dbg);
            }
          }
          await d.push(order[i] as Uint8Array);
          pushed.push(order[i] as Uint8Array);
        }
        expect(d.progress().complete).toBe(true);
        expect(d.result().payload).toEqual(c.bytes);
      }),
      { numRuns: 200 },
    );
  }, 600000);
});
