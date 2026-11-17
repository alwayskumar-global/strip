import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_GAUSSIAN_BLOCKS, DENSE_PERIOD, maxDenseRows } from "../src/constants.js";

describe("dense constants (R2.2, R5.19)", () => {
  it("default D is the provisional 4", () => {
    expect(DENSE_PERIOD).toBe(4);
  });
  it("maxDenseRows = maxGaussianBlocks + 64", () => {
    expect(maxDenseRows(1024)).toBe(1088);
    expect(maxDenseRows(0)).toBe(64);
    expect(maxDenseRows(DEFAULT_MAX_GAUSSIAN_BLOCKS)).toBe(1088);
  });
});
