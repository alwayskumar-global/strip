import { describe, expect, it } from "vitest";
import { CodecError } from "../src/errors.js";
import { encode } from "../src/encoder.js";
import { pageRepairCount } from "../src/index.js";
describe("pageRepairCount (R9.8)", () => {
  it("equals encoder.page().length - K for a spread of file sizes at the default packet size", async () => {
    for (const kb of [1, 8, 16, 32, 64, 128, 184, 256]) {
      const e = await encode({ bytes: new Uint8Array(kb * 1024).map((_, i) => i * 7), name: "f.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
      expect(pageRepairCount(e.K), `${kb} KB (K=${e.K})`).toBe(e.page().length - e.K);
    }
  });
  it("matches the measured values of the app design: K 111 gives 38, K 155 gives 45", () => {
    expect(pageRepairCount(111)).toBe(38);
    expect(pageRepairCount(155)).toBe(45);
  });
  it("is a non-negative integer for every K in 1..16384 (sampled)", () => {
    for (let K = 1; K <= 16384; K += 97) {
      const r = pageRepairCount(K);
      expect(Number.isInteger(r) && r >= 0, `K=${K}`).toBe(true);
    }
    expect(pageRepairCount(16384)).toBeGreaterThan(0);
  });
  it("throws INVALID_INPUT outside 1..16384 and for non-integers", () => {
    for (const bad of [0, -1, 16385, 1.5, Number.NaN, Infinity, "3" as unknown as number, null as unknown as number]) {
      expect(() => pageRepairCount(bad)).toThrow(CodecError);
      try { pageRepairCount(bad); } catch (e) { expect((e as CodecError).code).toBe("INVALID_INPUT"); }
    }
  });
});
