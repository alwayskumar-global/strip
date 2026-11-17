// Seeded, pure port of the spike's camera-like degrader (docs/spikes/symbols-decoder.md, Method). Test support only.
import type { SymbolMatrix } from "../../src/matrix.js";
import type { ImageDataLike } from "../../src/types.js";

export type Profile = { rotMax: number; perspMax: number; contrast: number; noise: number; gradAmp: number };
/** Typical phone: rotation +-5 deg, perspective +-4%, 70% contrast, 4% noise, mild gradient. */
export const TYPICAL: Profile = { rotMax: 5, perspMax: 0.04, contrast: 0.7, noise: 0.04, gradAmp: 0.15 };
/** Deliberately harsh worst case: +-10 deg, +-8%, 50% contrast, 8% noise, gradient about +-16 levels. */
export const HARSH: Profile = { rotMax: 10, perspMax: 0.08, contrast: 0.5, noise: 0.08, gradAmp: 0.25 };
export const IDENTITY: Profile = { rotMax: 0, perspMax: 0, contrast: 1, noise: 0, gradAmp: 0 };

export type DegradeOptions = Partial<Profile> & {
  ppm: number;
  /** Gaussian blur sigma in capture pixels. */
  sigma: number;
  rng: () => number;
  quiet?: number;
  /** Fixed rotation in degrees (0..359), replacing the random draw within rotMax. */
  rotationDeg?: number;
  /** Occlude a fraction of the modules (they become light), as one solid block or scattered. */
  occlusion?: { fraction: number; mode: "block" | "scattered" };
  /** Swap dark and light in the final image. */
  invert?: boolean;
};

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

function occlude(m: SymbolMatrix, o: NonNullable<DegradeOptions["occlusion"]>, rng: () => number): boolean[] {
  const mods = m.modules.slice();
  const total = m.size * m.size;
  const count = Math.round(o.fraction * total);
  if (o.mode === "block") {
    const side = Math.max(1, Math.round(Math.sqrt(count)));
    const x0 = Math.floor(rng() * Math.max(1, m.size - side + 1));
    const y0 = Math.floor(rng() * Math.max(1, m.size - side + 1));
    for (let y = y0; y < Math.min(m.size, y0 + side); y++) for (let x = x0; x < Math.min(m.size, x0 + side); x++) mods[y * m.size + x] = false;
  } else {
    for (let i = 0; i < count; i++) mods[Math.floor(rng() * total)] = false;
  }
  return mods;
}

export function degrade(m: SymbolMatrix, opts: DegradeOptions): ImageDataLike {
  const profile: Profile = { ...IDENTITY, ...opts };
  const { ppm, sigma, rng } = opts;
  const quiet = opts.quiet ?? 4;
  const mods = opts.occlusion ? occlude(m, opts.occlusion, rng) : m.modules;
  const n = m.size;
  const N = n + 2 * quiet;
  const S = N * ppm;
  const big = opts.rotationDeg !== undefined && opts.rotationDeg % 90 !== 0;
  const F = Math.ceil(S * (big ? 1.5 : 1.2));
  const deg = opts.rotationDeg ?? (rng() * 2 - 1) * profile.rotMax;
  const th = (deg * Math.PI) / 180;
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const px = (rng() * 2 - 1) * profile.perspMax;
  const py = (rng() * 2 - 1) * profile.perspMax;
  const img = new Float32Array(F * F);
  const half = S / 2;
  const cx = F / 2;
  const SS = 2;
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      let acc = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const qx = (x + (i + 0.5) / SS - cx) / half;
          const qy = (y + (j + 0.5) / SS - cx) / half;
          const ax = c * qx + sn * qy;
          const ay = -sn * qx + c * qy;
          const d = 1 - (px * ax + py * ay);
          if (d <= 0.05) {
            acc += 255;
            continue;
          }
          const mx = Math.floor(((ax / d + 1) / 2) * N - quiet);
          const my = Math.floor(((ay / d + 1) / 2) * N - quiet);
          acc += mx >= 0 && my >= 0 && mx < n && my < n && mods[my * n + mx] === true ? 0 : 255;
        }
      }
      img[y * F + x] = acc / (SS * SS);
    }
  }
  const b = blur(img, F, F, sigma);
  const ga = rng() * 2 * Math.PI;
  const gx = Math.cos(ga);
  const gy = Math.sin(ga);
  const data = new Uint8ClampedArray(F * F * 4);
  const lo = ((1 - profile.contrast) / 2) * 255;
  const span = profile.contrast * 255;
  for (let y = 0; y < F; y++) {
    for (let x = 0; x < F; x++) {
      const p = y * F + x;
      let v = lo + ((b[p] as number) / 255) * span;
      v += profile.gradAmp * 255 * 0.25 * (((x - F / 2) * gx + (y - F / 2) * gy) / F) * 2;
      v += gauss(rng) * profile.noise * 255;
      v = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      if (opts.invert) v = 255 - v;
      data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = v;
      data[p * 4 + 3] = 255;
    }
  }
  return { width: F, height: F, data };
}
