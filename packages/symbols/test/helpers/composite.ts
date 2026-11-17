// A clean "page" of symbols: a grid of matrixToImageData tiles on white (test support for multi-symbol decoding).
import { encodeSymbol } from "../../src/encode-symbol.js";
import type { ImageDataLike } from "../../src/types.js";
import { matrixToImageData } from "./matrix-to-image.js";

/** Places each payload as its own symbol (smallest version unless `versions[i]` is given) in a grid of `cols` columns. */
export function compositeImage(payloads: readonly Uint8Array[], opts: { cols?: number; ppm?: number; versions?: readonly (number | undefined)[]; order?: readonly number[] } = {}): ImageDataLike {
  const ppm = opts.ppm ?? 4;
  const cols = opts.cols ?? Math.min(payloads.length, 3);
  const order = opts.order ?? payloads.map((_, i) => i);
  const tiles = order.map((idx) => {
    const v = opts.versions?.[idx];
    return matrixToImageData(encodeSymbol(payloads[idx] as Uint8Array, v === undefined ? {} : { version: v }), ppm, 4);
  });
  const cell = Math.max(...tiles.map((t) => t.width));
  const rows = Math.ceil(tiles.length / cols);
  const width = cell * cols;
  const height = cell * rows;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  tiles.forEach((t, i) => {
    const ox = (i % cols) * cell + Math.floor((cell - t.width) / 2);
    const oy = Math.floor(i / cols) * cell + Math.floor((cell - t.width) / 2);
    for (let y = 0; y < t.height; y++) data.set(t.data.subarray(y * t.width * 4, (y + 1) * t.width * 4), ((oy + y) * width + ox) * 4);
  });
  return { width, height, data };
}
