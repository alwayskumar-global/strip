import { describe, expect, it } from "vitest";
import { encodeSymbol } from "../src/encode-symbol.js";
import { HARSH, IDENTITY, TYPICAL, degrade } from "./helpers/degrade.js";
import { matrixToImageData } from "./helpers/matrix-to-image.js";
import { hashSeed, mulberry32, randomBytes } from "./helpers/prng.js";
import { wilson } from "./helpers/wilson.js";
const sym = () => encodeSymbol(Uint8Array.from({ length: 10 }, (_, i) => i * 17 + 3), { version: 1 });
const same = (a: Uint8ClampedArray, b: Uint8ClampedArray) => a.length === b.length && a.every((v, i) => v === b[i]);
describe("prng and seed hash", () => {
  it("is deterministic per seed and the hash differs across cell parameters", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
    expect(mulberry32(7)()).not.toBe(mulberry32(8)());
    const seeds = new Set([hashSeed("cell", 30, "L", 4, 1, 0), hashSeed("cell", 30, "L", 4, 1, 1), hashSeed("cell", 30, "M", 4, 1, 0), hashSeed("cell", 20, "L", 4, 1, 0), hashSeed("cell", 30, "L", 5, 1, 0)]);
    expect(seeds.size).toBe(5);
    expect(hashSeed("a", 1)).toBe(hashSeed("a", 1));
    for (let i = 0; i < 100; i++) expect(mulberry32(i)()).toBeLessThan(1);
    expect(randomBytes(mulberry32(1), 50)).toEqual(randomBytes(mulberry32(1), 50));
  });
});
describe("wilson", () => {
  it("matches known values", () => {
    expect(wilson(200, 200).lower).toBeCloseTo(0.9812, 3);
    expect(wilson(100, 100).lower).toBeCloseTo(0.963, 3);
    expect(wilson(0, 0)).toEqual({ lower: 0, upper: 1, rate: 0 });
    const w = wilson(180, 200);
    expect(w.rate).toBe(0.9);
    expect(w.lower).toBeLessThan(0.9);
    expect(w.upper).toBeGreaterThan(0.9);
    expect(wilson(0, 200).lower).toBe(0);
  });
});
describe("degrade (R6.2, R6.3, R6.5)", () => {
  const base = { ppm: 4, sigma: 1 } as const;
  it("same seed is byte-identical, different seeds differ, length and range are right, frame is 1.2 x the symbol", () => {
    const m = sym();
    const a = degrade(m, { ...base, ...TYPICAL, rng: mulberry32(5) });
    const b = degrade(m, { ...base, ...TYPICAL, rng: mulberry32(5) });
    const c = degrade(m, { ...base, ...TYPICAL, rng: mulberry32(6) });
    expect(same(a.data, b.data)).toBe(true);
    expect(same(a.data, c.data)).toBe(false);
    expect(a.data.length).toBe(a.width * a.height * 4);
    expect(a.width).toBe(Math.ceil((m.size + 8) * 4 * 1.2));
    expect(a.height).toBe(a.width);
    expect(HARSH.noise).toBeGreaterThan(TYPICAL.noise);
  });
  it("with no degradation it reproduces the rendered symbol on the paper-white frame", () => {
    const m = sym();
    const out = degrade(m, { ppm: 4, sigma: 0, rng: mulberry32(1), ...IDENTITY });
    const ref = matrixToImageData(m, 4, 4);
    const off = (out.width - ref.width) / 2;
    expect(Number.isInteger(off)).toBe(true);
    for (let y = 0; y < out.height; y++) {
      for (let x = 0; x < out.width; x++) {
        const rx = x - off;
        const ry = y - off;
        const want = rx >= 0 && ry >= 0 && rx < ref.width && ry < ref.height ? (ref.data[(ry * ref.width + rx) * 4] as number) : 255;
        expect(out.data[(y * out.width + x) * 4]).toBe(want);
      }
    }
  });
  it("each Degradation_Family hook changes the output relative to the identity case", () => {
    const m = sym();
    const id = degrade(m, { ppm: 4, sigma: 0, rng: mulberry32(2), ...IDENTITY });
    const hooks: Array<[string, Partial<Parameters<typeof degrade>[1]>]> = [
      ["rotation", { rotationDeg: 37 }],
      ["perspective", { perspMax: 0.08 }],
      ["blur", { sigma: 1.5 }],
      ["brightness", { contrast: 0.5 }],
      ["noise", { noise: 0.08 }],
      ["gradient", { gradAmp: 0.25 }],
      ["occlusion block", { occlusion: { fraction: 0.1, mode: "block" } }],
      ["occlusion scattered", { occlusion: { fraction: 0.1, mode: "scattered" } }],
      ["invert", { invert: true }],
    ];
    for (const [name, h] of hooks) {
      const o = degrade(m, { ppm: 4, sigma: 0, rng: mulberry32(2), ...IDENTITY, ...h });
      expect(same(o.data, id.data), name).toBe(false);
      expect(o.data.length).toBe(o.width * o.height * 4);
    }
    expect(degrade(m, { ppm: 4, sigma: 0, rng: mulberry32(2), ...IDENTITY, invert: true }).data[0]).toBe(0);
  });
});
