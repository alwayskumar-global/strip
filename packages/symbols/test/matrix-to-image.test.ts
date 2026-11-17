import { describe, expect, it } from "vitest";
import { encodeSymbol } from "../src/encode-symbol.js";
import { renderToCanvas } from "../src/render-canvas.js";
import { darkPixels, fakeCanvas } from "./helpers/fake-canvas.js";
import { matrixToImageData } from "./helpers/matrix-to-image.js";
const sym = (v: number) => encodeSymbol(Uint8Array.from({ length: 12 }, (_, i) => i * 29 + v), { version: v });
describe("matrixToImageData (test helper)", () => {
  it("size, data length, black/white pixels with alpha 255, white quiet zone", () => {
    const m = sym(2);
    const img = matrixToImageData(m, 3, 4);
    expect(img.width).toBe((m.size + 8) * 3);
    expect(img.height).toBe(img.width);
    expect(img.data.length).toBe(img.width * img.height * 4);
    for (let p = 0; p < img.data.length; p += 4) {
      const v = img.data[p] as number;
      expect(v === 0 || v === 255).toBe(true);
      expect(img.data[p + 1]).toBe(v);
      expect(img.data[p + 2]).toBe(v);
      expect(img.data[p + 3]).toBe(255);
    }
    const q = 4 * 3;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        if (x < q || y < q || x >= img.width - q || y >= img.height - q) expect(img.data[(y * img.width + x) * 4]).toBe(255);
      }
    }
  });
  it("pixels equal the union of fillRect calls from the canvas renderer (v1 and v10)", () => {
    for (const v of [1, 10]) {
      const m = sym(v);
      const ppm = 2;
      const { ctx, rects } = fakeCanvas();
      const { width } = renderToCanvas(ctx, m, { ppm, dark: "#010101", light: "#fefefe" });
      const dark = darkPixels(rects, "#010101");
      const img = matrixToImageData(m, ppm, 4);
      expect(img.width).toBe(width);
      let n = 0;
      for (let y = 0; y < width; y++) {
        for (let x = 0; x < width; x++) {
          const isDark = img.data[(y * width + x) * 4] === 0;
          expect(isDark).toBe(dark.has(y * 100000 + x));
          if (isDark) n++;
        }
      }
      expect(dark.size).toBe(n);
    }
  });
});
