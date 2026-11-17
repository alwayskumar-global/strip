import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encodeSymbol } from "../src/encode-symbol.js";
import { SymbolError } from "../src/errors.js";
import { renderToCanvas } from "../src/render-canvas.js";
import type { Canvas2DLike } from "../src/render-canvas.js";
import { darkPixels, fakeCanvas } from "./helpers/fake-canvas.js";
const sym = (v = 3) => encodeSymbol(Uint8Array.from({ length: 10 }, (_, i) => i * 7), { version: v });
describe("renderToCanvas", () => {
  it("R2.2, R3.1: pixel size is (size + 2 * quietZone) * ppm, default quiet zone 4", () => {
    const m = sym();
    const a = fakeCanvas();
    expect(renderToCanvas(a.ctx, m, { ppm: 5 })).toEqual({ width: (m.size + 8) * 5, height: (m.size + 8) * 5 });
    expect(a.canvas).toEqual({ width: (m.size + 8) * 5, height: (m.size + 8) * 5 });
    const b = fakeCanvas();
    expect(renderToCanvas(b.ctx, m, { ppm: 2, quietZone: 6 }).width).toBe((m.size + 12) * 2);
  });
  it("R3.1: every fillRect has integer coordinates and sizes, and smoothing is off before the first draw", () => {
    const { ctx, rects } = fakeCanvas();
    renderToCanvas(ctx, sym(10), { ppm: 3 });
    expect(rects.length).toBeGreaterThan(1);
    for (const r of rects) {
      expect([r.x, r.y, r.w, r.h].every(Number.isInteger)).toBe(true);
      expect(r.smoothing).toBe(false);
    }
  });
  it("R3.1: the union of dark rects equals the matrix dark modules", () => {
    const m = sym(5);
    const { ctx, rects } = fakeCanvas();
    renderToCanvas(ctx, m, { ppm: 2, dark: "#111", light: "#eee" });
    const dark = darkPixels(rects, "#111");
    for (let y = 0; y < m.size; y++) {
      for (let x = 0; x < m.size; x++) {
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          expect(dark.has((8 + y * 2 + j) * 100000 + 8 + x * 2 + i)).toBe(m.modules[y * m.size + x] === true);
        }
      }
    }
    expect(dark.size).toBe(m.modules.filter(Boolean).length * 4);
  });
  it("R3.4: default colours are black on white, and configured colours are used", () => {
    const a = fakeCanvas();
    renderToCanvas(a.ctx, sym(), { ppm: 1 });
    expect(new Set(a.rects.map((r) => r.fill))).toEqual(new Set(["#ffffff", "#000000"]));
    const b = fakeCanvas();
    renderToCanvas(b.ctx, sym(), { ppm: 1, dark: "navy", light: "#fffaf0" });
    expect(new Set(b.rects.map((r) => r.fill))).toEqual(new Set(["#fffaf0", "navy"]));
  });
  it("R3.2: a plain object literal satisfies Canvas2DLike without a DOM lib", () => {
    const ctx: Canvas2DLike = { fillStyle: "", imageSmoothingEnabled: true, fillRect: () => undefined };
    expect(renderToCanvas(ctx, sym(), { ppm: 1 }).width).toBeGreaterThan(0);
  });
  it("R8.5: a context without fillRect or imageSmoothingEnabled throws UNSUPPORTED_ENVIRONMENT", () => {
    for (const bad of [{ fillStyle: "", imageSmoothingEnabled: true }, { fillStyle: "", fillRect: () => undefined }, null]) {
      try {
        renderToCanvas(bad as unknown as Canvas2DLike, sym(), { ppm: 1 });
        expect.unreachable();
      } catch (e) {
        expect((e as SymbolError).code).toBe("UNSUPPORTED_ENVIRONMENT");
      }
    }
  });
  // Feature: symbols, Property 22: for any ppm, a quiet zone below 4 without allowShortQuietZone throws INVALID_INPUT, and with it renders
  it("P22: short quiet zone needs allowShortQuietZone", () => {
    const m = sym(1);
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 3 }), (ppm, qz) => {
        expect(() => renderToCanvas(fakeCanvas().ctx, m, { ppm, quietZone: qz })).toThrow(SymbolError);
        const r = renderToCanvas(fakeCanvas().ctx, m, { ppm, quietZone: qz, allowShortQuietZone: true });
        expect(r.width).toBe((m.size + 2 * qz) * ppm);
      }),
      { numRuns: 100 },
    );
  });
});
