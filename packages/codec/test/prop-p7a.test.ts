import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMetadata, serializeMetadata } from "../src/index.js";
import { arbMeta } from "./prop-helpers.js";

describe("Property 7a", () => {
  // Feature: codec, Property 7a: parseMetadata(serializeMetadata(m)) equals m
  // Validates: Requirements 1.3
  it("Feature: codec, Property 7a: parseMetadata(serializeMetadata(m)) equals m", () => {
    fc.assert(
      fc.property(arbMeta, (m) => {
        expect(parseMetadata(serializeMetadata(m))).toEqual(m);
      }),
      { numRuns: 500 },
    );
  });
});

