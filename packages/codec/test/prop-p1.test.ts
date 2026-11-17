import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder, encode, sha256WebCrypto } from "../src/index.js";
import { arbCase, shuffleWith } from "./prop-helpers.js";

describe("Property 1", () => {
  // Feature: codec, Property 1: shuffled systematic Packets recover identical bytes and Metadata
  // Validates: Requirements 1.2, 1.8, 2.5, 5.12
  it("Feature: codec, Property 1: shuffled systematic Packets recover identical bytes and Metadata", async () => {
    await fc.assert(
      fc.asyncProperty(arbCase, fc.integer(), async (c, seed) => {
        const e = await encode({ bytes: c.bytes, name: c.name, mime: c.mime }, { packetSize: c.packetSize });
        const packets = Array.from({ length: e.K }, () => e.next());
        const d = createDecoder();
        for (const p of shuffleWith(packets, seed)) await d.push(p);
        expect(d.progress().complete).toBe(true);
        const r = d.result();
        expect(r.payload).toEqual(c.bytes);
        expect(r.metadata.name).toBe(c.name);
        expect(r.metadata.mime).toBe(c.mime);
        expect(r.metadata.byteLength).toBe(c.bytes.length);
        expect(r.metadata.sha256).toEqual(await sha256WebCrypto(c.bytes));
      }),
      { numRuns: 200 },
    );
  }, 600000);
});
