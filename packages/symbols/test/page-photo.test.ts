import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MOD_MM, PITCH_MM, X0, Y0, makePage, photo } from "./helpers/page-photo.js";
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
const SMALL = { width: 150, height: 200 } as const;
describe("page-photo generator (R6.12)", () => {
  it("the page has nine distinct 1732-byte payloads, each a v30 L symbol of 137 modules", () => {
    const page = makePage(3);
    expect(page.payloads.length).toBe(9);
    expect(new Set(page.payloads.map((p) => Array.from(p).join(","))).size).toBe(9);
    for (const p of page.payloads) expect(p.length).toBe(1732);
    for (const m of page.matrices) expect([m.version, m.ecc, m.size]).toEqual([30, "L", 137]);
    expect(makePage(3).payloads).toEqual(page.payloads);
    expect(makePage(4).payloads).not.toEqual(page.payloads);
  });
  it("output length is width x height x 4, values stay in 0..255, and the fraction sets the pixels per module", () => {
    const page = makePage(1);
    const a = photo(page, 1, { ...SMALL, fill: 0.92 });
    const b = photo(page, 1, { ...SMALL, fill: 0.75 });
    expect(a.data.length).toBe(150 * 200 * 4);
    expect(a.data.every((v) => v >= 0 && v <= 255)).toBe(true);
    expect(a.pxPerMm).toBeCloseTo((200 * 0.92) / 297, 10);
    expect(a.pixelsPerModule).toBeCloseTo(a.pxPerMm * MOD_MM, 10);
    expect(b.pixelsPerModule / a.pixelsPerModule).toBeCloseTo(0.75 / 0.92, 10);
    expect(same(a.data, b.data)).toBe(false);
  });
  it("at 12 MP and 92% the module is about 5 px and at 75% about 4.1 px", () => {
    const page = makePage(1);
    const pxPerMm = (4000 * 0.92) / 297;
    expect(pxPerMm * MOD_MM).toBeCloseTo(5.02, 1);
    expect((4000 * 0.75 * MOD_MM) / 297).toBeCloseTo(4.09, 1);
    expect(page.matrices.length).toBe(9);
  });
  it("the nine symbol centres map inside the photo (92% case) through the generator's own homography", () => {
    const page = makePage(2);
    const p = photo(page, 2, { ...SMALL, fill: 0.92 });
    const tol = 1.5 / p.pxPerMm; // mm
    for (let ty = 0; ty < 3; ty++) {
      for (let tx = 0; tx < 3; tx++) {
        const cxMm = X0 + (tx + 0.5) * PITCH_MM;
        const cyMm = Y0 + (ty + 0.5) * PITCH_MM;
        let best = Infinity;
        for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
          const { mx, my } = p.inverse(x + 0.5, y + 0.5);
          best = Math.min(best, Math.hypot(mx - cxMm, my - cyMm));
        }
        expect(best, `tile ${tx},${ty}`).toBeLessThanOrEqual(tol);
      }
    }
  });
  // Feature: symbols, Property 35: for any seed, the page-photo generator returns byte-identical images on two calls and different images for different seeds, at a reduced photo size
  it("P35: deterministic per seed, different across seeds (reduced size)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100000 }), (seed) => {
        const page = makePage(seed);
        const a = photo(page, seed, SMALL);
        expect(same(a.data, photo(page, seed, SMALL).data)).toBe(true);
        expect(same(a.data, photo(page, seed + 1, SMALL).data)).toBe(false);
      }),
      { numRuns: 25, seed: 35 },
    );
  });
});
