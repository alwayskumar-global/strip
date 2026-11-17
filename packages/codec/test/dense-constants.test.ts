import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_GAUSSIAN_BLOCKS, DENSE_PERIOD, maxDenseRows, SOLITON_C, SOLITON_DELTA } from "../src/constants.js";

describe("dense constants (R2.2, R5.19)", () => {
  it("D is frozen at 3 (R2.2, R10.7)", () => {
    expect(DENSE_PERIOD).toBe(3);
  });
  it("c and delta are frozen at 1/10 and 1/2 (R2.2, R10.7)", () => {
    expect(SOLITON_C).toEqual([1, 10]);
    expect(SOLITON_DELTA).toEqual([1, 2]);
  });
  it("maxDenseRows = maxGaussianBlocks + 64", () => {
    expect(maxDenseRows(1024)).toBe(1088);
    expect(maxDenseRows(0)).toBe(64);
    expect(maxDenseRows(DEFAULT_MAX_GAUSSIAN_BLOCKS)).toBe(1088);
  });
});
