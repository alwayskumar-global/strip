import { describe, expect, it } from "vitest";
import { crc32 } from "../src/crc32.js";

const ascii = (s: string) => Uint8Array.from(s, (ch) => ch.charCodeAt(0));

describe("crc32", () => {
  it('R3.1: crc32("123456789") = 0xCBF43926', () => {
    expect(crc32(ascii("123456789"))).toBe(0xcbf43926);
  });
  it("R3.1: empty input = 0", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
  it("R3.1: bytes 0..31 = 0x91267E8A", () => {
    expect(crc32(Uint8Array.from({ length: 32 }, (_, i) => i))).toBe(0x91267e8a);
  });
  it("R3.2: start and end select a sub-range", () => {
    const data = ascii("xx123456789yy");
    expect(crc32(data, 2, 11)).toBe(0xcbf43926);
  });
  it("returns an unsigned value", () => {
    expect(crc32(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).toBeGreaterThanOrEqual(0);
  });
});
