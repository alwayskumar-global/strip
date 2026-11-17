import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder, encode } from "../src/index.js";
import { arbSmallCase, shuffleWith } from "./prop-helpers.js";

describe("Property 3", () => {
  // Feature: codec, Property 3: any two permutations recover equal bytes
  // Validates: Requirements 5.14
  it("Feature: codec, Property 3: any two permutations recover equal bytes", async () => {
    await fc.assert(
      fc.asyncProperty(arbSmallCase, fc.integer(), fc.integer(), fc.integer({ min: 0, max: 10 }), async (c, s1, s2, extra) => {
        const e = await encode({ bytes: c.bytes, name: c.name, mime: c.mime }, { packetSize: c.packetSize });
        const set = Array.from({ length: e.K + extra }, () => e.next()); // all systematic plus some repair
        const run = async (seed: number) => {
          const d = createDecoder();
          for (const p of shuffleWith(set, seed)) await d.push(p);
          return d;
        };
        const a = await run(s1);
        const b = await run(s2);
        expect(a.progress().complete).toBe(true);
        expect(b.progress().complete).toBe(true);
        expect(a.result().payload).toEqual(b.result().payload);
        expect(a.result().payload).toEqual(c.bytes);
        expect(a.result().metadata).toEqual(b.result().metadata);
      }),
      { numRuns: 200 },
    );
  }, 600000);
});
