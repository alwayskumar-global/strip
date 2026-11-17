import type { Canvas2DLike } from "../../src/render-canvas.js";
export type Rect = { x: number; y: number; w: number; h: number; fill: unknown; smoothing: boolean };
export function fakeCanvas(): { ctx: Canvas2DLike; rects: Rect[]; canvas: { width: number; height: number } } {
  const rects: Rect[] = [];
  const canvas = { width: 0, height: 0 };
  const ctx: Canvas2DLike = {
    fillStyle: "",
    imageSmoothingEnabled: true,
    canvas,
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, fill: ctx.fillStyle, smoothing: ctx.imageSmoothingEnabled });
    },
  };
  return { ctx, rects, canvas };
}
/** Rasterises recorded rects into RGB-ish "dark/light" per pixel: returns a Set of dark pixel keys and the light fill. */
export function darkPixels(rects: Rect[], dark: unknown): Set<number> {
  const s = new Set<number>();
  for (const r of rects) {
    if (r.fill !== dark) continue;
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) s.add((r.y + j) * 100000 + r.x + i);
  }
  return s;
}
