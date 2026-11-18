import type { SymbolMatrix } from "@strip/symbols";
// Fake-camera video files for the camera project: Y4M (C420jpeg) frames that Chromium loops as the camera feed.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export const W = 1280;
export const H = 720;
export const FAKE_CAMERA = `${process.cwd()}/test-results/fake-camera/cam.y4m`;
const I420 = (w: number, h: number): number => w * h + 2 * ((w / 2) * (h / 2));
/** A white frame with the symbol (quiet zone included) drawn in the middle at `scale` pixels per module. */
export function symbolFrame(m: SymbolMatrix, scale = 4): Uint8Array {
  const f = new Uint8Array(I420(W, H));
  f.fill(255, 0, W * H); // luma: white
  f.fill(128, W * H); // chroma: neutral
  const total = (m.size + 8) * scale;
  const x0 = Math.floor((W - total) / 2);
  const y0 = Math.floor((H - total) / 2);
  for (let y = 0; y < m.size; y++) {
    for (let x = 0; x < m.size; x++) {
      if (m.modules[y * m.size + x] !== true) continue;
      for (let dy = 0; dy < scale; dy++) f.fill(0, (y0 + (y + 4) * scale + dy) * W + x0 + (x + 4) * scale, (y0 + (y + 4) * scale + dy) * W + x0 + (x + 5) * scale);
    }
  }
  return f;
}
/** A symbol as the harness returns it: its size and the modules as a "0" and "1" string. */
export interface WireSymbol {
  size: number;
  modules: string;
}
export const toMatrix = (w: WireSymbol): SymbolMatrix => ({ size: w.size, modules: [...w.modules].map((c) => c === "1"), version: 30, ecc: "L", mask: 0 });
export const wireFrame = (w: WireSymbol, scale = 4): Uint8Array => symbolFrame(toMatrix(w), scale);
export function blankFrame(): Uint8Array {
  const f = new Uint8Array(I420(W, H));
  f.fill(255, 0, W * H);
  f.fill(128, W * H);
  return f;
}
/** RGBA (W x H x 4) to I420, 2 x 2 chroma averaging. */
export function rgbaToI420(rgba: Uint8Array): Uint8Array {
  const out = new Uint8Array(I420(W, H));
  const cw = W / 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    out[y * W + x] = Math.round(0.299 * (rgba[i] as number) + 0.587 * (rgba[i + 1] as number) + 0.114 * (rgba[i + 2] as number));
  }
  for (let y = 0; y < H / 2; y++) for (let x = 0; x < cw; x++) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const i = ((2 * y + dy) * W + 2 * x + dx) * 4;
      r += rgba[i] as number; g += rgba[i + 1] as number; b += rgba[i + 2] as number;
    }
    r /= 4; g /= 4; b /= 4;
    out[W * H + y * cw + x] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
    out[W * H + (H / 2) * cw + y * cw + x] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
  }
  return out;
}
export function writeY4M(frames: Uint8Array[], fps = 5, path = FAKE_CAMERA): void {
  mkdirSync(dirname(path), { recursive: true });
  const head = Buffer.from(`YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`);
  const frameHead = Buffer.from("FRAME\n");
  writeFileSync(path, Buffer.concat([head, ...frames.flatMap((f) => [frameHead, Buffer.from(f)])]));
}
