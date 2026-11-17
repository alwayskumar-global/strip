import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder, decodePacket, encode, encodePacket, parseMetadata, serializeMetadata } from "../src/index.js";
import { CodecError } from "../src/errors.js";
import { createDecoderWith } from "../src/decoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { lcgBytes } from "./prop-helpers.js";

const BAD_NUMBERS = fc.constantFrom<unknown>(Number.NaN, 1.5, -1, "10", null, {}, [], true);
const GOOD = { bytes: lcgBytes(100, 1), name: "ok.bin", mime: "x/y" };

async function failure(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe("Property 13", () => {
  // Feature: codec, Property 13: invalid input throws CodecError with no partial effect
  // Validates: Requirements 9.2, 9.3
  it("Feature: codec, Property 13: invalid input throws CodecError with no partial effect", async () => {
    const live = await encode(GOOD, { packetSize: 62 });
    const first = live.next();
    const dec = createDecoderWith({}, DEFAULT_FORMAT);
    await dec.push(first);
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.record({ what: fc.constant("encode-payload" as const), v: fc.constantFrom<unknown>(null, undefined, 5, "s", [], { bytes: [1, 2], name: "a", mime: "" }, { bytes: new Uint8Array(1), name: 5, mime: "" }, { bytes: new Uint8Array(1), name: "a", mime: null }) }),
          fc.record({ what: fc.constant("encode-option" as const), key: fc.constantFrom("packetSize", "repairCount", "maxPayloadBytes", "maxBlockCount"), v: BAD_NUMBERS }),
          fc.record({ what: fc.constant("encode-range" as const), v: fc.constantFrom({ packetSize: 45 }, { packetSize: 65566 }, { maxPayloadBytes: 0 }, { maxBlockCount: 0 }, { repairCount: 4294967295 }) }),
          fc.record({ what: fc.constant("encode-hash" as const), v: fc.constantFrom<unknown>(5, "x", {}, [], null) }),
          fc.record({ what: fc.constant("decoder-option" as const), key: fc.constantFrom("maxGaussianBlocks", "maxBlockCount", "maxPayloadBytes"), v: BAD_NUMBERS }),
          fc.record({ what: fc.constant("decoder-hash" as const), v: fc.constantFrom<unknown>(5, "x", {}, []) }),
          fc.record({ what: fc.constant("push" as const), v: fc.constantFrom<unknown>([], "x", 5, null, undefined, new Uint16Array(3), new ArrayBuffer(4), {}) }),
          fc.record({ what: fc.constant("helpers" as const), v: fc.constantFrom<unknown>("x", 5, null, [1, 2]) }),
        ),
        async (c) => {
          const snap = { p: dec.progress(), dbg: dec.debug() };
          let err: unknown;
          if (c.what === "encode-payload") err = await failure(() => encode(c.v as never));
          else if (c.what === "encode-option") err = await failure(() => encode(GOOD, { [c.key]: c.v } as never));
          else if (c.what === "encode-range") err = await failure(() => encode(GOOD, c.v as never));
          else if (c.what === "encode-hash") err = await failure(() => encode(GOOD, { hash: c.v } as never));
          else if (c.what === "decoder-option") err = await failure(() => createDecoder({ [c.key]: c.v } as never));
          else if (c.what === "decoder-hash") err = await failure(() => createDecoder({ hash: c.v } as never));
          else if (c.what === "push") err = await failure(() => dec.push(c.v as never));
          else {
            const results = await Promise.all([
              failure(() => decodePacket(c.v as never)),
              failure(() => parseMetadata(c.v as never)),
              failure(() => serializeMetadata(c.v as never)),
              failure(() => encodePacket(c.v as never)),
            ]);
            for (const r of results) {
              expect(r).toBeInstanceOf(CodecError);
              expect((r as CodecError).code).toBe("INVALID_INPUT");
            }
            err = results[0];
          }
          expect(err).toBeInstanceOf(CodecError);
          expect((err as CodecError).code).toBe("INVALID_INPUT");
          // no partial effect on existing state
          expect(dec.progress()).toEqual(snap.p);
          expect(dec.debug()).toEqual(snap.dbg);
        },
      ),
      { numRuns: 300 },
    );
    // the live encoder was never touched by failed calls on others: its sequence continues
    expect(decodePacket(live.next()).seq).toBe(1);
  }, 600000);
});
