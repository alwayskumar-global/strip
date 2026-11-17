import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { serializeMetadata } from "../src/index.js";
import { arbMime, arbName, codeOf, lcgBytes } from "./prop-helpers.js";

const CONTROL = fc.oneof(fc.integer({ min: 0, max: 0x1f }), fc.constant(0x7f));
const insertAt = (s: string, i: number, ch: string): string => s.slice(0, i % (s.length + 1)) + ch + s.slice(i % (s.length + 1));

describe("Property 7b", () => {
  // Feature: codec, Property 7b: invalid names throw BAD_METADATA
  // Validates: Requirements 1.4
  it("Feature: codec, Property 7b: invalid names throw BAD_METADATA", () => {
    const invalidName = fc.oneof(
      fc.constant(""),
      fc.constantFrom(".", ".."),
      fc.record({ n: arbName, pos: fc.nat(), ch: fc.constantFrom("/", "\\") }).map((r) => insertAt(r.n, r.pos, r.ch)),
      fc.record({ n: arbName, pos: fc.nat(), cc: CONTROL }).map((r) => insertAt(r.n, r.pos, String.fromCharCode(r.cc))),
      fc.record({ unit: fc.constantFrom("a", "é", "日", "😀"), extra: fc.integer({ min: 0, max: 40 }) }).map((r) => {
        const bytes = new Map([["a", 1], ["é", 2], ["日", 3], ["😀", 4]]).get(r.unit) as number;
        return r.unit.repeat(Math.floor(256 / bytes) + 1 + r.extra); // always more than 255 UTF-8 bytes
      }),
    );
    fc.assert(
      fc.property(invalidName, arbMime, fc.integer(), (name, mime, seed) => {
        expect(codeOf(() => serializeMetadata({ name, mime, byteLength: 1, sha256: lcgBytes(32, seed) }))).toBe("BAD_METADATA");
      }),
      { numRuns: 500 },
    );
  });
});

