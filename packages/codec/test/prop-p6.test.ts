import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodePacket, encodePacket } from "../src/index.js";
import { ceilDiv } from "../src/header.js";
import { lcgBytes } from "./prop-helpers.js";

describe("Property 6", () => {
  // Feature: codec, Property 6: decodePacket(encodePacket(p)) equals p
  // Validates: Requirements 3.1, 3.15
  it("Feature: codec, Property 6: decodePacket(encodePacket(p)) equals p", () => {
    fc.assert(
      fc.property(
        fc.record({
          sessionId: fc.integer({ min: 0, max: 0xffffffff }),
          seq: fc.integer({ min: 0, max: 0xffffffff }),
          blockSize: fc.oneof(fc.integer({ min: 16, max: 300 }), fc.constantFrom(16, 17, 2923, 65535)),
          totalLength: fc.oneof(fc.integer({ min: 1, max: 5000 }), fc.integer({ min: 1, max: 0xffffffff })),
          seed: fc.integer(),
        }),
        (r) => {
          const p = { sessionId: r.sessionId, seq: r.seq, blockSize: r.blockSize, totalLength: r.totalLength, blockCount: ceilDiv(r.totalLength, r.blockSize), payload: lcgBytes(r.blockSize, r.seed) };
          const bytes = encodePacket(p);
          expect(bytes.length).toBe(p.blockSize + 30);
          const q = decodePacket(bytes, { maxPayloadBytes: 0xffffffff, maxBlockCount: 0xffffffff });
          expect({ ...q, payload: Array.from(q.payload) }).toEqual({ ...p, payload: Array.from(p.payload) });
        },
      ),
      { numRuns: 500 },
    );
  });
});
