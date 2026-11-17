import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fitScale } from "../src/fit-scale.js";
import { SymbolError } from "../src/errors.js";
const m = (v: number) => ({ size: 17 + 4 * v });
describe("fitScale", () => {
  it("R14.5: 720p at 70% (box 504): v25 scale >= 4, v26 scale 3; 1080p (box 756): v40 scale >= 4", () => {
    const b720 = { width: 504, height: 504 };
    expect(fitScale(m(25), 4, b720).ppm).toBeGreaterThanOrEqual(4);
    expect(fitScale(m(26), 4, b720).ppm).toBe(3);
    expect(fitScale(m(40), 4, { width: 756, height: 756 }).ppm).toBeGreaterThanOrEqual(4);
    expect(fitScale(m(41 - 1), 4, { width: 756, height: 756 })).toEqual({ ppm: 4, width: 740, height: 740 });
  });
  it("R3.6: a box smaller than the module count returns zeros and does not throw", () => {
    expect(fitScale(m(1), 4, { width: 28, height: 1000 })).toEqual({ ppm: 0, width: 0, height: 0 });
    expect(fitScale(m(1), 4, { width: 0, height: 0 })).toEqual({ ppm: 0, width: 0, height: 0 });
    expect(fitScale(m(1), 4, { width: 29, height: 29 }).ppm).toBe(1);
  });
  it("rejects invalid input", () => {
    for (const fn of [
      () => fitScale({ size: 20.5 }, 4, { width: 9, height: 9 }),
      () => fitScale(m(1), -1, { width: 9, height: 9 }),
      () => fitScale(m(1), 4, { width: Number.NaN, height: 9 }),
      () => fitScale(m(1), 4, { width: -1, height: 9 }),
    ]) expect(fn).toThrow(SymbolError);
  });
  // Feature: symbols, Property 7: for any matrix, quiet zone and box, fitScale returns the largest integer ppm with modules * ppm at most min(box), width and height equal modules * ppm, and returns {0,0,0} without throwing when the box is smaller than modules
  it("P7: largest integer scale that fits", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40 }), fc.integer({ min: 0, max: 12 }), fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 5000 }), (v, qz, w, h) => {
        const modules = 17 + 4 * v + 2 * qz;
        const r = fitScale(m(v), qz, { width: w, height: h });
        const s = Math.min(w, h);
        if (s < modules) {
          expect(r).toEqual({ ppm: 0, width: 0, height: 0 });
          return;
        }
        expect(r.width).toBe(modules * r.ppm);
        expect(r.height).toBe(modules * r.ppm);
        expect(modules * r.ppm).toBeLessThanOrEqual(s);
        expect(modules * (r.ppm + 1)).toBeGreaterThan(s);
      }),
      { numRuns: 100 },
    );
  });
});
