import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encode } from "../src/index.js";
import { arbCase } from "./prop-helpers.js";

describe("Property 8", () => {
  // Feature: codec, Property 8: identical input gives identical Packet bytes
  // Validates: Requirements 4.1, 6.1
  it("Feature: codec, Property 8: identical input gives identical Packet bytes", async () => {
    await fc.assert(
      fc.asyncProperty(arbCase, async (c) => {
        const p = { bytes: c.bytes, name: c.name, mime: c.mime };
        const a = await encode(p, { packetSize: c.packetSize });
        const b = await encode(p, { packetSize: c.packetSize });
        expect(b.sessionId).toBe(a.sessionId);
        for (let i = 0; i < 3 * a.K; i++) expect(b.next()).toEqual(a.next());
        const pa = a.page();
        const pb = b.page();
        expect(pb.length).toBe(pa.length);
        pa.forEach((x, i) => expect(pb[i]).toEqual(x));
      }),
      { numRuns: 100 },
    );
  }, 600000);
});
