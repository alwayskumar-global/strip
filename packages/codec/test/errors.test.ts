import { describe, expect, it } from "vitest";
import { CodecError, ERROR_CODES, IGNORE_REASONS } from "../src/errors.js";
import * as c from "../src/constants.js";

describe("errors", () => {
  it("R7.5: ERROR_CODES holds exactly the ten codes", () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        "BAD_CRC",
        "BAD_HEADER",
        "BAD_METADATA",
        "HASH_MISMATCH",
        "INCOMPLETE_DECODE",
        "INVALID_INPUT",
        "PAYLOAD_TOO_LARGE",
        "SESSION_MISMATCH",
        "TOO_MANY_BLOCKS",
        "UNSUPPORTED_VERSION",
      ].sort(),
    );
    expect(ERROR_CODES).toHaveLength(10);
    expect(new Set(ERROR_CODES).size).toBe(10);
  });

  it("R5.20: IGNORE_REASONS holds exactly the four reasons", () => {
    expect([...IGNORE_REASONS].sort()).toEqual(
      ["ALREADY_COMPLETE", "DENSE_STORE_FULL", "DUPLICATE_PACKET", "SESSION_MISMATCH"].sort(),
    );
  });

  it("R7.6: CodecError carries code and a non-empty message", () => {
    const e = new CodecError("BAD_CRC", "checksum mismatch");
    expect(e).toBeInstanceOf(CodecError);
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("BAD_CRC");
    expect(e.message).toBe("checksum mismatch");
    expect(e.name).toBe("CodecError");
  });

  it("R7.6: an empty message falls back to the code", () => {
    expect(new CodecError("BAD_HEADER", "").message).toBe("BAD_HEADER");
  });
});

describe("constants", () => {
  it("R3.4, R7.1, R7.2, R5.9: defaults", () => {
    expect(c.DEFAULT_PACKET_SIZE).toBe(2953);
    expect(c.DEFAULT_PACKET_SIZE - c.PACKET_OVERHEAD).toBe(2923);
    expect(c.DEFAULT_MAX_PAYLOAD_BYTES).toBe(32 * 1024 * 1024);
    expect(c.DEFAULT_MAX_BLOCK_COUNT).toBe(16384);
    expect(c.DEFAULT_MAX_GAUSSIAN_BLOCKS).toBe(1024);
  });

  it("R3.5: packet size bounds are 46 and 65565", () => {
    expect(c.MIN_PACKET_SIZE).toBe(46);
    expect(c.MAX_PACKET_SIZE).toBe(65565);
  });

  it("R3.1: header is 26 bytes and the header CRC covers 22", () => {
    expect(c.HEADER_SIZE).toBe(26);
    expect(c.HEADER_CRC_COVERAGE).toBe(22);
    expect(c.MAGIC).toBe(0x5354);
  });
});
