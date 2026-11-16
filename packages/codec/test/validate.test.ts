import { describe, expect, it } from "vitest";
import { CodecError } from "../src/errors.js";
import {
  assertFunction,
  assertInteger,
  validateMaxBlockCount,
  validateMaxGaussianBlocks,
  validateMaxPayloadBytes,
  validatePacketBytes,
  validatePacketSize,
  validatePayloadShape,
  validateRepairCount,
} from "../src/validate.js";

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof CodecError ? e.code : `non-CodecError: ${String(e)}`;
  }
  return undefined;
}

const NOT_NUMBERS = ["1", null, undefined, {}, [], true, 1.5, Number.NaN, Infinity, -Infinity];

describe("validators", () => {
  it("R3.5, R9.2: packetSize accepts [46, 65565] only", () => {
    expect(validatePacketSize(46)).toBe(46);
    expect(validatePacketSize(2953)).toBe(2953);
    expect(validatePacketSize(65565)).toBe(65565);
    for (const bad of [45, 65566, 0, -1, ...NOT_NUMBERS]) expect(code(() => validatePacketSize(bad))).toBe("INVALID_INPUT");
  });

  it("R4.6: repairCount is an integer in [0, 2^32 - 1 - K]", () => {
    expect(validateRepairCount(0, 10)).toBe(0);
    expect(validateRepairCount(4294967295 - 10, 10)).toBe(4294967285);
    for (const bad of [-1, 4294967296 - 10, ...NOT_NUMBERS]) expect(code(() => validateRepairCount(bad, 10))).toBe("INVALID_INPUT");
  });

  it("R7.1: maxPayloadBytes is an integer >= 1", () => {
    expect(validateMaxPayloadBytes(1)).toBe(1);
    expect(validateMaxPayloadBytes(33554432)).toBe(33554432);
    expect(validateMaxPayloadBytes(2 ** 40)).toBe(2 ** 40);
    for (const bad of [0, -5, ...NOT_NUMBERS]) expect(code(() => validateMaxPayloadBytes(bad))).toBe("INVALID_INPUT");
  });

  it("R7.2: maxBlockCount is an integer >= 1", () => {
    expect(validateMaxBlockCount(1)).toBe(1);
    expect(validateMaxBlockCount(100000)).toBe(100000);
    for (const bad of [0, -5, ...NOT_NUMBERS]) expect(code(() => validateMaxBlockCount(bad))).toBe("INVALID_INPUT");
  });

  it("R5.9: maxGaussianBlocks is an integer >= 0", () => {
    expect(validateMaxGaussianBlocks(0)).toBe(0);
    expect(validateMaxGaussianBlocks(1024)).toBe(1024);
    for (const bad of [-1, ...NOT_NUMBERS]) expect(code(() => validateMaxGaussianBlocks(bad))).toBe("INVALID_INPUT");
  });

  it("R9.2: hash must be a function", () => {
    const fn = () => new Uint8Array(32);
    expect(assertFunction("hash", fn)).toBe(fn);
    for (const bad of ["x", 1, null, undefined, {}, []]) expect(code(() => assertFunction("hash", bad))).toBe("INVALID_INPUT");
  });

  it("R9.2: payload shape needs bytes, name and mime of the right types", () => {
    const ok = { bytes: new Uint8Array(3), name: "a.txt", mime: "text/plain" };
    expect(validatePayloadShape(ok)).toEqual(ok);
    for (const bad of [
      null,
      undefined,
      "x",
      [],
      {},
      { ...ok, bytes: [1, 2, 3] },
      { ...ok, bytes: new ArrayBuffer(2) },
      { ...ok, name: 5 },
      { ...ok, mime: null },
      { bytes: ok.bytes, name: ok.name },
    ]) {
      expect(code(() => validatePayloadShape(bad))).toBe("INVALID_INPUT");
    }
  });

  it("R9.2: packet bytes must be a Uint8Array", () => {
    const p = new Uint8Array(4);
    expect(validatePacketBytes(p)).toBe(p);
    for (const bad of [[1, 2], "abc", null, undefined, new ArrayBuffer(4), new Uint16Array(2)]) {
      expect(code(() => validatePacketBytes(bad))).toBe("INVALID_INPUT");
    }
  });

  it("assertInteger reports the field name", () => {
    try {
      assertInteger("foo", 3.5, 0, 10);
    } catch (e) {
      expect((e as CodecError).message).toContain("foo");
    }
  });
});
