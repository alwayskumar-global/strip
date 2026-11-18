import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { SymbolMatrix } from "@strip/symbols";
import { QUIET, symbolPath, viewSide } from "./symbol-path.js";
const matrixArb = fc.integer({ min: 1, max: 6 }).chain((version) => {
  const size = 17 + 4 * version;
  return fc.array(fc.boolean(), { minLength: size * size, maxLength: size * size }).map((modules): SymbolMatrix => ({ size, modules, version, ecc: "L", mask: 0 }));
});
/** Re-expands the path into a size x size grid. */
function expand(d: string, size: number): boolean[] {
  const grid = new Array<boolean>(size * size).fill(false);
  for (const m of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
    const x = Number(m[1]) - QUIET;
    const y = Number(m[2]) - QUIET;
    const len = Number(m[3]);
    expect(Number(m[4])).toBe(len);
    for (let i = 0; i < len; i++) grid[y * size + x + i] = true;
  }
  return grid;
}
describe("symbolPath (P11, R19.12)", () => {
  // Feature: unit (P11): d equals the dark modules as merged runs; re-expanding gives the matrix; viewBox side is size + 8
  it("P11: runs are maximal, re-expanding gives the matrix, and the viewBox side is size + 8", () => {
    fc.assert(
      fc.property(matrixArb, (m) => {
        const d = symbolPath(m);
        expect(expand(d, m.size)).toEqual([...m.modules]);
        expect(viewSide(m)).toBe(m.size + 8);
        // maximal runs: no two runs on one row touch
        const runs = [...d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)].map((x) => [Number(x[1]), Number(x[2]), Number(x[3])] as const);
        for (let i = 1; i < runs.length; i++) {
          const [px, py, pl] = runs[i - 1] as readonly [number, number, number];
          const [x, y] = runs[i] as readonly [number, number, number];
          if (py === y) expect(x).toBeGreaterThan(px + pl);
        }
      }),
      { numRuns: 100 },
    );
  });
  it("an all-light matrix gives an empty path, a single dark module gives one run", () => {
    const light: SymbolMatrix = { size: 21, modules: new Array<boolean>(441).fill(false), version: 1, ecc: "L", mask: 0 };
    expect(symbolPath(light)).toBe("");
    const one = { ...light, modules: light.modules.map((_, i) => i === 0) };
    expect(symbolPath(one)).toBe("M4 4h1v1h-1z");
  });
});
