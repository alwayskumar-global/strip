import { readFileSync, readdirSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { sha256WebCrypto } from "@strip/codec";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeFrame } from "../src/decode.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { HARSH, TYPICAL, degrade } from "./helpers/degrade.js";
import type { Profile } from "./helpers/degrade.js";
import { mulberry32, randomBytes } from "./helpers/prng.js";
import { readerWasmBytes } from "./helpers/wasm-bytes.js";
const dir = `${process.cwd()}/test/fixtures/degraded`;
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
type Recipe = { id: string; version: number; ecc: "L" | "M" | "Q" | "H"; ppm: number; blur: number; seed: number; profile: string; length: number; sha256: string };
const recipes = (JSON.parse(readFileSync(`${dir}/recipes.json`, "utf8")) as { profiles: Record<string, Profile>; recipes: Recipe[] }).recipes;
const images = (JSON.parse(readFileSync(`${dir}/images.json`, "utf8")) as { images: Array<{ file: string; expectedHex: string }> }).images;
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
beforeAll(() => resetBackend());
describe("degraded fixtures (R6.2, R6.3)", () => {
  it("size budget: at most 6 PGM files, each at most 50 KB, total at most 300 KB", () => {
    const files = readdirSync(dir).filter((f) => f.endsWith(".pgm.gz"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(6);
    let total = 0;
    for (const f of files) {
      const size = statSync(`${dir}/${f}`).size;
      expect(size, f).toBeLessThanOrEqual(50 * 1024);
      total += size;
    }
    expect(total).toBeLessThanOrEqual(300 * 1024);
    expect(images.map((i) => i.file).sort()).toEqual(files.sort());
  });
  it("every recipe regenerates a payload with the stored sha256, and the degraded frame decodes to that payload", async () => {
    expect(recipes.length).toBeGreaterThanOrEqual(12);
    for (const r of recipes) {
      const rng = mulberry32(r.seed);
      const payload = randomBytes(rng, r.length);
      expect(hex(await sha256WebCrypto(payload)), r.id).toBe(r.sha256);
      const profile = r.profile === "typical" ? TYPICAL : HARSH;
      const frame = degrade(encodeSymbol(payload, { version: r.version, ecc: r.ecc }), { ppm: r.ppm, sigma: r.blur, rng, ...profile });
      const out = await decodeFrame(frame, { wasm });
      expect(out.kind, `${r.id} v${r.version} ppm${r.ppm} blur${r.blur}`).toBe("found");
      if (out.kind === "found") expect(hex(out.bytes), r.id).toBe(hex(payload));
    }
  }, 120_000);
  it("every real PGM image decodes through the zxing backend to the expected bytes", async () => {
    for (const im of images) {
      const raw = gunzipSync(readFileSync(`${dir}/${im.file}`));
      const text = String.fromCharCode(...raw.subarray(0, 20));
      const m = /^P5\n(\d+) (\d+)\n255\n/.exec(text);
      expect(m, im.file).not.toBeNull();
      const w = Number(m?.[1]);
      const h = Number(m?.[2]);
      const body = raw.subarray((m?.[0] ?? "").length);
      expect(body.length).toBe(w * h);
      const data = new Uint8ClampedArray(w * h * 4);
      for (let p = 0; p < w * h; p++) {
        data[p * 4] = data[p * 4 + 1] = data[p * 4 + 2] = body[p] as number;
        data[p * 4 + 3] = 255;
      }
      const out = await decodeFrame({ width: w, height: h, data }, { wasm });
      expect(out.kind, im.file).toBe("found");
      if (out.kind === "found") expect(hex(out.bytes), im.file).toBe(im.expectedHex);
    }
  });
});
