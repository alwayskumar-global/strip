import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { crc32 } from "../src/crc32.js";
import { encodeWith } from "../src/encoder.js";
import { ERROR_CODES } from "../src/errors.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { arbSmallCase } from "./prop-helpers.js";

const refreshCrcs = (p: Uint8Array): void => {
  if (p.length < 30) return;
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  dv.setUint32(22, crc32(p, 0, 22));
  dv.setUint32(p.length - 4, crc32(p, 0, p.length - 4));
};

describe("Property 11 regression: shrunk counterexample", () => {
  it("a re-CRC'd forged packet ends in terminal HASH_MISMATCH; every later push is rejected without throwing", async () => {
    const e = await encodeWith({ bytes: new Uint8Array(0), name: " ", mime: "" }, { packetSize: 51 }, {});
    expect(e.K).toBe(2);
    const stream = Array.from({ length: e.K + 6 }, () => e.next());
    const d = createDecoderWith({}, DEFAULT_FORMAT);
    await d.push(stream[0] as Uint8Array);
    const forged = (stream[0] as Uint8Array).slice();
    forged[18] = 212; // high byte of seq: a huge sequence number, well-formed after re-CRC
    refreshCrcs(forged);
    const s = await d.push(forged);
    expect(s).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
    expect(d.progress()).toMatchObject({ solvedBlocks: 2, distinctPackets: 2, complete: false }); // state already changed
    expect(() => d.result()).toThrow();
    for (const later of stream) {
      expect(await d.push(later)).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
    }
    expect(d.progress().complete).toBe(false);
  });
});

describe("Property 11", () => {
  // Feature: codec, Property 11: packet-level rejections leave state unchanged and push never throws
  // Validates: Requirements 7.7, 9.2
  it("Feature: codec, Property 11: packet-level rejections leave state unchanged and push never throws", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbSmallCase,
        fc.boolean(),
        fc.oneof(
          fc.record({ kind: fc.constant("random" as const), bytes: fc.uint8Array({ maxLength: 200 }) }),
          fc.record({ kind: fc.constant("flip" as const), n: fc.integer({ min: 1, max: 3 }), at: fc.array(fc.nat(), { minLength: 3, maxLength: 3 }) }),
          fc.record({ kind: fc.constant("truncate" as const), at: fc.nat() }),
          fc.record({ kind: fc.constant("extend" as const), extra: fc.uint8Array({ minLength: 1, maxLength: 20 }) }),
          fc.record({ kind: fc.constant("header" as const), at: fc.integer({ min: 0, max: 21 }), value: fc.integer({ min: 0, max: 255 }) }),
        ),
        fc.nat(),
        async (c, startSession, mutation, which) => {
          const e = await encodeWith({ bytes: c.bytes, name: c.name, mime: c.mime }, { packetSize: c.packetSize }, {});
          const stream = Array.from({ length: e.K + 6 }, () => e.next());
          const d = createDecoderWith({}, DEFAULT_FORMAT);
          if (startSession) await d.push(stream[0] as Uint8Array);
          const base = (stream[which % stream.length] as Uint8Array).slice();
          let bad: Uint8Array;
          if (mutation.kind === "random") bad = mutation.bytes;
          else if (mutation.kind === "flip") {
            bad = base.slice();
            for (let i = 0; i < mutation.n; i++) {
              const bit = (mutation.at[i] as number) % (bad.length * 8);
              bad[bit >> 3] = (bad[bit >> 3] as number) ^ (1 << (bit & 7));
            }
          } else if (mutation.kind === "truncate") bad = base.slice(0, mutation.at % base.length);
          else if (mutation.kind === "extend") {
            bad = new Uint8Array(base.length + mutation.extra.length);
            bad.set(base);
            bad.set(mutation.extra, base.length);
          } else {
            bad = base.slice();
            bad[mutation.at] = mutation.value;
            refreshCrcs(bad); // CRCs valid again, so the field checks after them are exercised
          }
          const before = { p: d.progress(), dbg: d.debug() };
          const s = await d.push(bad); // must resolve, never throw
          expect(["accepted", "ignored", "rejected"]).toContain(s.kind);
          if (s.kind === "rejected") expect(ERROR_CODES).toContain(s.code);
          const verdict = s.kind === "rejected" && (s.code === "HASH_MISMATCH" || s.code === "BAD_METADATA");
          if (verdict) {
            // Decoder-level verdict (a re-CRC'd forged packet corrupted the recovered bytes): terminal,
            // state already changed, and every later push is rejected without throwing.
            for (const later of stream) {
              const t = await d.push(later);
              expect(t).toMatchObject({ kind: "rejected", code: s.code });
            }
          } else if (s.kind !== "accepted") {
            // Packet-level rejections and ignores leave the state unchanged.
            expect(d.progress()).toEqual(before.p);
            expect(d.debug()).toEqual(before.dbg);
          }
        },
      ),
      { numRuns: 500 },
    );
  }, 600000);
});
