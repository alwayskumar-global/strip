// renderToCanvas (R3): crisp integer-scale drawing through a structural context type, so src needs no DOM lib.
import { SymbolError } from "./errors.js";
import type { SymbolMatrix } from "./matrix.js";
import type { RenderOptions } from "./types.js";
import { assertRenderOptions } from "./validate.js";

export type Canvas2DLike = {
  fillStyle: unknown;
  imageSmoothingEnabled: boolean;
  fillRect(x: number, y: number, w: number, h: number): void;
  /** When present, its width and height are set to the rendered size before drawing. */
  readonly canvas?: { width: number; height: number };
};

export function renderToCanvas(ctx: Canvas2DLike, m: SymbolMatrix, options: RenderOptions): { width: number; height: number } {
  assertRenderOptions(options);
  if (typeof ctx !== "object" || ctx === null || typeof ctx.fillRect !== "function" || !("imageSmoothingEnabled" in ctx)) {
    throw new SymbolError("UNSUPPORTED_ENVIRONMENT", "canvas context needs fillRect and imageSmoothingEnabled");
  }
  const { ppm } = options;
  const qz = options.quietZone ?? 4;
  const modules = m.size + 2 * qz;
  const px = modules * ppm;
  if (ctx.canvas) {
    ctx.canvas.width = px;
    ctx.canvas.height = px;
  }
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = options.light ?? "#ffffff";
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = options.dark ?? "#000000";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (m.modules[y * m.size + x] !== true) {
        x++;
        continue;
      }
      const start = x;
      while (x < m.size && m.modules[y * m.size + x] === true) x++;
      ctx.fillRect((qz + start) * ppm, (qz + y) * ppm, (x - start) * ppm, ppm);
    }
  }
  return { width: px, height: px };
}
