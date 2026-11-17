import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseMetadata, serializeMetadata } from "../src/index.js";
import { arbMeta, codeOf } from "./prop-helpers.js";

describe("Property 7c", () => {
  // Feature: codec, Property 7c: mutated records throw BAD_METADATA
  // Validates: Requirements 1.6
  it("Feature: codec, Property 7c: mutated records throw BAD_METADATA", () => {
    fc.assert(
      fc.property(arbMeta, fc.constantFrom("truncate", "append", "nameLen", "mimeLen"), fc.nat(), fc.integer({ min: 1, max: 255 }), (m, kind, n, delta) => {
        const rec = serializeMetadata(m);
        let bad: Uint8Array;
        if (kind === "truncate") {
          bad = rec.slice(0, n % rec.length); // any strictly shorter prefix, including empty
        } else if (kind === "append") {
          bad = new Uint8Array(rec.length + 1 + (n % 20));
          bad.set(rec);
        } else if (kind === "nameLen") {
          bad = rec.slice();
          const len = ((rec[1] as number) << 8) | (rec[2] as number);
          const changed = (len + delta) & 0xffff;
          bad[1] = changed >> 8;
          bad[2] = changed & 0xff;
          if (changed === len) bad[2] = ((bad[2] as number) + 1) & 0xff;
        } else {
          bad = rec.slice();
          const at = 3 + (((rec[1] as number) << 8) | (rec[2] as number));
          bad[at] = ((rec[at] as number) + delta) & 0xff;
          if (bad[at] === rec[at]) bad[at] = ((bad[at] as number) + 1) & 0xff;
        }
        expect(codeOf(() => parseMetadata(bad))).toBe("BAD_METADATA");
      }),
      { numRuns: 500 },
    );
  });
});
