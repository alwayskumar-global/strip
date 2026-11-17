import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bytesToLatin1, latin1TextEncoder } from "../src/bytes.js";
describe("Latin-1 mapping (R1.13)", () => {
  it("maps all 256 byte values to the same char codes and back", () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    const s = bytesToLatin1(all);
    expect(s.length).toBe(256);
    for (let i = 0; i < 256; i++) expect(s.charCodeAt(i)).toBe(i);
    expect([...latin1TextEncoder.encode(s)]).toEqual([...all]);
  });
  it("handles empty input and input longer than the chunk size", () => {
    expect(bytesToLatin1(new Uint8Array(0))).toBe("");
    expect(latin1TextEncoder.encode("").length).toBe(0);
    const big = Uint8Array.from({ length: 20000 }, (_, i) => (i * 31 + 7) & 255);
    const s = bytesToLatin1(big);
    expect(s.length).toBe(20000);
    expect([...latin1TextEncoder.encode(s)]).toEqual([...big]);
  });
  // Feature: symbols, Property 20: for any bytes, bytesToLatin1 then latin1TextEncoder.encode returns the input and each char code equals the byte
  it("P20: round trip and char code equality for any bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 20000 }), (b) => {
        const s = bytesToLatin1(b);
        expect(s.length).toBe(b.length);
        for (let i = 0; i < b.length; i += 997) expect(s.charCodeAt(i)).toBe(b[i]);
        expect(latin1TextEncoder.encode(s)).toEqual(b);
      }),
      { numRuns: 100 },
    );
  });
});
