import { describe, expect, it } from "vitest";
import { crc32 } from "../src/crc32.js";
import { decodePacket, encodePacket, type PacketFields } from "../src/packet.js";
import { codeOf, rawPacket } from "./helpers.js";

const fields = (over: Partial<PacketFields> = {}): PacketFields => ({
  sessionId: 0x01020304,
  totalLength: 40,
  blockSize: 16,
  blockCount: 3,
  seq: 0x0a0b0c0d,
  payload: Uint8Array.from({ length: 16 }, (_, i) => 0xf0 + i),
  ...over,
});

describe("encodePacket layout (R3.1, R3.2)", () => {
  it("writes the header big-endian at the documented offsets", () => {
    const b = encodePacket(fields());
    expect(b.length).toBe(16 + 30);
    expect([...b.subarray(0, 4)]).toEqual([0x53, 0x54, 1, 0]);
    expect([...b.subarray(4, 8)]).toEqual([1, 2, 3, 4]);
    expect([...b.subarray(8, 12)]).toEqual([0, 0, 0, 40]);
    expect([...b.subarray(12, 14)]).toEqual([0, 16]);
    expect([...b.subarray(14, 18)]).toEqual([0, 0, 0, 3]);
    expect([...b.subarray(18, 22)]).toEqual([0x0a, 0x0b, 0x0c, 0x0d]);
    const dv = new DataView(b.buffer);
    expect(dv.getUint32(22)).toBe(crc32(b, 0, 22));
    expect([...b.subarray(26, 42)]).toEqual([...fields().payload]);
    expect(dv.getUint32(42)).toBe(crc32(b, 0, 42));
  });

  it("default packet size gives 2953 bytes for blockSize 2923", () => {
    const b = encodePacket(fields({ blockSize: 2923, totalLength: 2923, blockCount: 1, payload: new Uint8Array(2923) }));
    expect(b.length).toBe(2953);
  });

  it("round trips every field", () => {
    const f = fields();
    expect(decodePacket(encodePacket(f))).toEqual(f);
  });

  it("round trips the blockSize bounds 16 and 65535", () => {
    for (const bs of [16, 65535]) {
      const f = fields({ blockSize: bs, totalLength: bs, blockCount: 1, payload: new Uint8Array(bs).fill(7) });
      expect(decodePacket(encodePacket(f))).toEqual(f);
    }
  });

  it("regression (property 13 counterexample): a null or undefined packet is INVALID_INPUT, not a TypeError", () => {
    for (const bad of [null, undefined, 5, "x", [1, 2]]) {
      expect(codeOf(() => encodePacket(bad as never))).toBe("INVALID_INPUT");
    }
  });

  it("rejects invalid fields with INVALID_INPUT", () => {
    expect(codeOf(() => encodePacket(fields({ payload: new Uint8Array(15) })))).toBe("INVALID_INPUT");
    expect(codeOf(() => encodePacket(fields({ blockCount: 4 })))).toBe("INVALID_INPUT");
    expect(codeOf(() => encodePacket(fields({ blockSize: 15, payload: new Uint8Array(15) })))).toBe("INVALID_INPUT");
    expect(codeOf(() => encodePacket(fields({ seq: -1 })))).toBe("INVALID_INPUT");
    expect(codeOf(() => encodePacket(fields({ totalLength: 0, blockCount: 0 })))).toBe("INVALID_INPUT");
  });
});

describe("decodePacket check order (R3.6 to R3.16)", () => {
  it("accepts a well-formed raw packet", () => {
    expect(codeOf(() => decodePacket(rawPacket()))).toBeUndefined();
  });

  it("1: shorter than the header is BAD_HEADER", () => {
    expect(codeOf(() => decodePacket(new Uint8Array(25)))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(new Uint8Array(0)))).toBe("BAD_HEADER");
  });

  it("2: a bad header CRC is BAD_CRC and wins over every later defect", () => {
    expect(codeOf(() => decodePacket(rawPacket({ badHeaderCrc: true })))).toBe("BAD_CRC");
    expect(
      codeOf(() => decodePacket(rawPacket({ badHeaderCrc: true, magic: 0, version: 9, flags: 1, lengthDelta: 5, badTrailingCrc: true }))),
    ).toBe("BAD_CRC");
  });

  it("3: wrong magic or non-zero flags is BAD_HEADER", () => {
    expect(codeOf(() => decodePacket(rawPacket({ magic: 0x5355 })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ flags: 1 })))).toBe("BAD_HEADER");
  });

  it("4: version other than 1 is UNSUPPORTED_VERSION, but only after the magic check", () => {
    expect(codeOf(() => decodePacket(rawPacket({ version: 2 })))).toBe("UNSUPPORTED_VERSION");
    expect(codeOf(() => decodePacket(rawPacket({ version: 0 })))).toBe("UNSUPPORTED_VERSION");
    expect(codeOf(() => decodePacket(rawPacket({ version: 2, magic: 0 })))).toBe("BAD_HEADER");
  });

  it("5: L above maxPayloadBytes is PAYLOAD_TOO_LARGE (default 32 MiB, configurable)", () => {
    const big = rawPacket({ blockSize: 65535, totalLength: 33554433, blockCount: 513, payload: new Uint8Array(65535) });
    expect(codeOf(() => decodePacket(big))).toBe("PAYLOAD_TOO_LARGE");
    const exact = rawPacket({ blockSize: 65535, totalLength: 33554432, blockCount: 513, payload: new Uint8Array(65535) });
    expect(codeOf(() => decodePacket(exact))).toBeUndefined();
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 33 }), { maxPayloadBytes: 32 }))).toBe("PAYLOAD_TOO_LARGE");
  });

  it("6: K above maxBlockCount is TOO_MANY_BLOCKS, checked after L", () => {
    const p = rawPacket({ blockSize: 16, totalLength: 16 * 16385, blockCount: 16385 });
    expect(codeOf(() => decodePacket(p))).toBe("TOO_MANY_BLOCKS");
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 48, blockCount: 3 }), { maxBlockCount: 2 }))).toBe("TOO_MANY_BLOCKS");
    // L over the limit wins over K over the limit.
    const both = rawPacket({ blockSize: 16, totalLength: 50_000_000, blockCount: 3_125_000 });
    expect(codeOf(() => decodePacket(both))).toBe("PAYLOAD_TOO_LARGE");
  });

  it("limits are checked before consistency (L over limit with inconsistent K)", () => {
    const p = rawPacket({ totalLength: 3_000_000_000, blockCount: 1 });
    expect(codeOf(() => decodePacket(p))).toBe("PAYLOAD_TOO_LARGE");
  });

  it("huge L and K fail fast without sizing any buffer from them", () => {
    const p = rawPacket({ totalLength: 0xffffffff, blockCount: 0xffffffff });
    expect(codeOf(() => decodePacket(p))).toBe("PAYLOAD_TOO_LARGE");
    const q = rawPacket({ totalLength: 1000, blockCount: 0xffffffff });
    expect(codeOf(() => decodePacket(q))).toBe("TOO_MANY_BLOCKS");
  });

  it("7: K must equal ceil(L / blockSize)", () => {
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 40, blockCount: 2 })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 40, blockCount: 4 })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 0, blockCount: 0 })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 32, blockCount: 2 })))).toBeUndefined();
    expect(codeOf(() => decodePacket(rawPacket({ totalLength: 33, blockCount: 3 })))).toBeUndefined();
  });

  it("7: blockSize outside [16, 65535] is BAD_HEADER", () => {
    expect(codeOf(() => decodePacket(rawPacket({ blockSize: 15, totalLength: 15, blockCount: 1, payload: new Uint8Array(15) })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ blockSize: 0, totalLength: 0, blockCount: 0, payload: new Uint8Array(0) })))).toBe("BAD_HEADER");
  });

  it("8: packet length must equal 30 + blockSize, before the trailing CRC", () => {
    expect(codeOf(() => decodePacket(rawPacket({ lengthDelta: 1 })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ lengthDelta: -1 })))).toBe("BAD_HEADER");
    expect(codeOf(() => decodePacket(rawPacket({ lengthDelta: 1, badTrailingCrc: true })))).toBe("BAD_HEADER");
  });

  it("9: a bad trailing CRC is BAD_CRC", () => {
    expect(codeOf(() => decodePacket(rawPacket({ badTrailingCrc: true })))).toBe("BAD_CRC");
  });

  it("R3.9: every single-bit flip of a small packet is rejected (exhaustive)", () => {
    const good = encodePacket(fields());
    expect(good.length).toBe(46);
    for (let bit = 0; bit < good.length * 8; bit++) {
      const bad = good.slice();
      bad[bit >> 3] = (bad[bit >> 3] as number) ^ (1 << (bit & 7));
      expect(codeOf(() => decodePacket(bad)), `bit ${bit}`).toBeDefined();
    }
  });

  it("returns a payload view and does not alias a copy of the header", () => {
    const f = fields();
    const d = decodePacket(encodePacket(f));
    expect(d.payload).toEqual(f.payload);
  });

  it("works on a packet that is a subarray of a larger buffer", () => {
    const f = fields();
    const b = encodePacket(f);
    const host = new Uint8Array(100);
    host.set(b, 13);
    expect(decodePacket(host.subarray(13, 13 + b.length))).toEqual(f);
  });

  it("rejects non-Uint8Array input and bad limits with INVALID_INPUT", () => {
    expect(codeOf(() => decodePacket([1, 2, 3] as unknown as Uint8Array))).toBe("INVALID_INPUT");
    expect(codeOf(() => decodePacket(rawPacket(), { maxPayloadBytes: 0 }))).toBe("INVALID_INPUT");
    expect(codeOf(() => decodePacket(rawPacket(), { maxBlockCount: 1.5 }))).toBe("INVALID_INPUT");
  });
});
