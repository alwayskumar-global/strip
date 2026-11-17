import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder, decodePacket, encode } from "../src/index.js";
import { CodecError } from "../src/errors.js";
import { ERROR_CODES } from "../src/errors.js";
import { arbSmallCase } from "./prop-helpers.js";

describe("Property 5", () => {
  // Feature: codec, Property 5: any single flipped bit is rejected
  // Validates: Requirements 3.9
  it("Feature: codec, Property 5: any single flipped bit is rejected", async () => {
    await fc.assert(
      fc.asyncProperty(arbSmallCase, fc.nat(), fc.nat(), async (c, which, bitSeed) => {
        const e = await encode({ bytes: c.bytes, name: c.name, mime: c.mime }, { packetSize: c.packetSize });
        const target = which % (3 * e.K);
        let packet = e.next();
        for (let i = 0; i < target; i++) packet = e.next(); // systematic, sparse and dense packets all get hit
        expect(() => decodePacket(packet)).not.toThrow();
        const bit = bitSeed % (packet.length * 8);
        const bad = packet.slice();
        bad[bit >> 3] = (bad[bit >> 3] as number) ^ (1 << (bit & 7));
        let thrown: unknown;
        try {
          decodePacket(bad);
        } catch (err) {
          thrown = err;
        }
        expect(thrown).toBeInstanceOf(CodecError);
        const d = createDecoder();
        const s = await d.push(bad);
        expect(s.kind).toBe("rejected");
        if (s.kind === "rejected") expect(ERROR_CODES).toContain(s.code);
      }),
      { numRuns: 1000 },
    );
  }, 600000);
});
