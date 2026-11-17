// Seeded TypeScript port of the spike's page-photo generator (docs/spikes/symbols-multi.md): a photo of a printed A4
// page with a 3 x 3 grid of version 30, ECC L symbols, degraded like a typical phone shot. Test support only.
import { encodeSymbol } from "../../src/encode-symbol.js";
import type { SymbolMatrix } from "../../src/matrix.js";
import type { ImageDataLike } from "../../src/types.js";
import { hashSeed, mulberry32, randomBytes } from "./prng.js";

export const MOD_MM = 0.4048; // the board grid: 58.7 mm per 145-module symbol
export const SYM_MODS = 145;
export const PITCH_MM = SYM_MODS * MOD_MM;
export const PAGE_W = 210;
export const PAGE_H = 297;
export const X0 = (PAGE_W - 3 * PITCH_MM) / 2;
export const Y0 = 28;

export type Page = { payloads: Uint8Array[]; matrices: SymbolMatrix[] };
export type PhotoOptions = {
  width?: number;
  height?: number;
  /** Page height as a fraction of the photo height. */
  fill?: number;
  rotMax?: number;
  perspMax?: number;
  sigma?: number;
  contrast?: number;
  noise?: number;
  gradAmp?: number;
};
export type Photo = ImageDataLike & { pxPerMm: number; pixelsPerModule: number; inverse(x: number, y: number): { mx: number; my: number } };

export function makePage(seed: number): Page {
  const rng = mulberry32(hashSeed("page", seed));
  const payloads: Uint8Array[] = [];
  const matrices: SymbolMatrix[] = [];
  for (let i = 0; i < 9; i++) {
    const p = randomBytes(rng, 1732);
    payloads.push(p);
    matrices.push(encodeSymbol(p, { version: 30, ecc: "L" }));
  }
  return { payloads, matrices };
}

const gauss = (rng: () => number): number => {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma <= 0) return src;
  const rad = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * rad + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + rad] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] = (k[i] as number) / sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += (src[y * w + Math.min(w - 1, Math.max(0, x + i))] as number) * (k[i + rad] as number);
      tmp[y * w + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += (tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] as number) * (k[i + rad] as number);
      out[y * w + x] = a;
    }
  }
  return out;
}

export function photo(page: Page, seed: number, opts: PhotoOptions = {}): Photo {
  const W = opts.width ?? 3000;
  const H = opts.height ?? 4000;
  const fill = opts.fill ?? 0.92;
  const rotMax = opts.rotMax ?? 10;
  const perspMax = opts.perspMax ?? 0.04;
  const sigma = opts.sigma ?? 1;
  const contrast = opts.contrast ?? 0.7;
  const noise = opts.noise ?? 0.04;
  const gradAmp = opts.gradAmp ?? 0.15;
  const rng = mulberry32(hashSeed("photo", seed));
  const pxPerMm = (H * fill) / PAGE_H;
  const half = H / 2;
  const mmPerUnit = half / pxPerMm;
  const th = ((rng() * 2 - 1) * rotMax * Math.PI) / 180;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const px = (rng() * 2 - 1) * perspMax;
  const py = (rng() * 2 - 1) * perspMax;
  const cx = W / 2;
  const cy = H / 2;
  const inverse = (x: number, y: number): { mx: number; my: number } => {
    const qx = (x - cx) / half;
    const qy = (y - cy) / half;
    const ax = c * qx + sn * qy;
    const ay = -sn * qx + c * qy;
    const d = 1 - (px * ax + py * ay);
    return { mx: PAGE_W / 2 + (ax / d) * mmPerUnit, my: PAGE_H / 2 + (ay / d) * mmPerUnit };
  };
  const mats = page.matrices.map((m) => m.modules);
  const img = new Float32Array(W * H);
  const SS = 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const qx = (x + (i + 0.5) / SS - cx) / half;
          const qy = (y + (j + 0.5) / SS - cy) / half;
          const ax = c * qx + sn * qy;
          const ay = -sn * qx + c * qy;
          const d = 1 - (px * ax + py * ay);
          const mx = PAGE_W / 2 + (ax / d) * mmPerUnit;
          const my = PAGE_H / 2 + (ay / d) * mmPerUnit;
          let v: number;
          if (mx < 0 || my < 0 || mx >= PAGE_W || my >= PAGE_H) v = 70;
          else {
            v = 245;
            const tx = Math.floor((mx - X0) / PITCH_MM);
            const ty = Math.floor((my - Y0) / PITCH_MM);
            if (tx >= 0 && tx < 3 && ty >= 0 && ty < 3) {
              const mod = Math.floor((mx - X0 - tx * PITCH_MM) / MOD_MM - 4);
              const mody = Math.floor((my - Y0 - ty * PITCH_MM) / MOD_MM - 4);
              if (mod >= 0 && mody >= 0 && mod < 137 && mody < 137 && (mats[ty * 3 + tx] as readonly boolean[])[mody * 137 + mod]) v = 10;
            }
          }
          acc += v;
        }
      }
      img[y * W + x] = acc / (SS * SS);
    }
  }
  const b = blur(img, W, H, sigma);
  const ga = rng() * 2 * Math.PI;
  const gx = Math.cos(ga);
  const gy = Math.sin(ga);
  const data = new Uint8ClampedArray(W * H * 4);
  const lo = ((1 - contrast) / 2) * 255;
  const span = contrast * 255;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      let v = lo + ((b[p] as number) / 255) * span;
      v += gradAmp * 255 * 0.5 * (((x - W / 2) * gx + (y - H / 2) * gy) / W);
      v += gauss(rng) * noise * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = v;
      data[p * 4 + 3] = 255;
    }
  }
  return { width: W, height: H, data, pxPerMm, pixelsPerModule: pxPerMm * MOD_MM, inverse };
}
