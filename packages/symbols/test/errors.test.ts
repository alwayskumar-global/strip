import { describe, expect, it } from "vitest";
import { SYMBOL_ERROR_CODES, SymbolError } from "../src/errors.js";
describe("errors (R8.1)", () => {
  it("has exactly the four closed codes", () => {
    expect([...SYMBOL_ERROR_CODES]).toEqual(["INVALID_INPUT", "PACKET_TOO_LARGE", "ENCODE_FAILED", "UNSUPPORTED_ENVIRONMENT"]);
  });
  it("SymbolError is an Error carrying a code in the set and a non-empty message", () => {
    for (const code of SYMBOL_ERROR_CODES) {
      const e = new SymbolError(code, "boom");
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(SymbolError);
      expect(e.code).toBe(code);
      expect(e.message).toBe("boom");
      expect(SYMBOL_ERROR_CODES).toContain(e.code);
    }
    expect(new SymbolError("INVALID_INPUT", "").message.length).toBeGreaterThan(0);
  });
});
