// Test support, NOT exported from the barrel (R12.1): the same pixels the canvas path draws, as RGBA in Node.
import type { SymbolMatrix } from "../../src/matrix.js";
import type { ImageDataLike } from "../../src/types.js";

export function matrixToImageData(m: SymbolMatrix, ppm: number, quietZone = 4): ImageDataLike {
  const modules = m.size + 2 * quietZone;
  const width = modules * ppm;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.modules[y * m.size + x] !== true) continue;
      for (let j = 0; j < ppm; j++) {
        const row = ((quietZone + y) * ppm + j) * width + (quietZone + x) * ppm;
        for (let i = 0; i < ppm; i++) {
          const p = (row + i) * 4;
          data[p] = 0;
          data[p + 1] = 0;
          data[p + 2] = 0; // alpha stays 255
        }
      }
    }
  }
  return { width, height: width, data };
}
