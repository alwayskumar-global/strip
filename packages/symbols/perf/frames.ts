// Camera-like frames for the decode perf script: one degraded symbol centred on a paper-grey frame.
import { QR_CAPACITY_BY_VERSION } from "../src/capacity.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { TYPICAL, degrade } from "../test/helpers/degrade.js";
import { hashSeed, mulberry32, randomBytes } from "../test/helpers/prng.js";
import type { EccLevel, ImageDataLike } from "../src/types.js";

export function makeFrame(version: number, ecc: EccLevel, width: number, height: number, ppm: number): { frame: ImageDataLike; payload: Uint8Array; content: string } {
  const rng = mulberry32(hashSeed("perf-frame", version, ecc, width, height, ppm));
  const len = (QR_CAPACITY_BY_VERSION[version] as Record<EccLevel, number>)[ecc];
  const payload = randomBytes(rng, len);
  const sym = degrade(encodeSymbol(payload, { version, ecc }), { ppm, sigma: 1, rng, ...TYPICAL });
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = 185 + Math.floor(rng() * 12) - 6;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const ox = Math.floor((width - sym.width) / 2);
  const oy = Math.floor((height - sym.height) / 2);
  for (let y = 0; y < sym.height; y++) {
    for (let x = 0; x < sym.width; x++) {
      const yy = y + oy;
      const xx = x + ox;
      if (yy < 0 || yy >= height || xx < 0 || xx >= width) continue;
      const v = sym.data[(y * sym.width + x) * 4] as number;
      const d = (yy * width + xx) * 4;
      data[d] = data[d + 1] = data[d + 2] = v;
    }
  }
  return { frame: { width, height, data }, payload, content: `v${version} ${ecc} ${len} B at ${ppm} px/module, Typical_Profile, blur 1, centred on a ${width}x${height} frame` };
}
