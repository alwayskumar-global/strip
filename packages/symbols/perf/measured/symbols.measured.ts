// Measured claims for @strip/symbols (R6). Run with `pnpm test:measured`.
// ONLY the Default_Cell cells under the Typical_Profile are asserted (R6.8, R6.9, R6.1). Every other cell is printed as
// informational output with N, the observed rate and the Wilson lower bound, and has no assertion (R6.6).
// Seeds are hashed from the tag "measured" and differ from the fixture seeds (task 3.2) and from the spike's seeds.
import { beforeAll, describe, expect, it } from "vitest";
import { QR_CAPACITY_BY_VERSION, QR_DEFAULTS } from "../../src/capacity.js";
import { decodeFrame } from "../../src/decode.js";
import { encodeSymbol } from "../../src/encode-symbol.js";
import { resetBackend } from "../../src/wasm-runtime.js";
import { HARSH, TYPICAL, degrade } from "../../test/helpers/degrade.js";
import type { DegradeOptions, Profile } from "../../test/helpers/degrade.js";
import { matrixToImageData } from "../../test/helpers/matrix-to-image.js";
import { hashSeed, mulberry32, randomBytes } from "../../test/helpers/prng.js";
import { readerWasmBytes } from "../../test/helpers/wasm-bytes.js";
import { wilson } from "../../test/helpers/wilson.js";
import type { EccLevel } from "../../src/types.js";

const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
const DEFAULT = QR_DEFAULTS.screen; // v30, L, 1732 bytes, 4 ppm
beforeAll(() => resetBackend());

type Cell = {
  label: string;
  N: number;
  ppm: number;
  sigma: number;
  profile: Profile;
  extra?: Partial<DegradeOptions>;
  mode?: "video" | "photo";
  version?: number;
  ecc?: EccLevel;
};
async function run(cell: Cell): Promise<{ successes: number; N: number; rate: number; lower: number; upper: number }> {
  const version = cell.version ?? DEFAULT.version;
  const ecc = cell.ecc ?? DEFAULT.ecc;
  const len = (QR_CAPACITY_BY_VERSION[version] as Record<EccLevel, number>)[ecc];
  let ok = 0;
  for (let t = 0; t < cell.N; t++) {
    const rng = mulberry32(hashSeed("measured", cell.label, version, ecc, cell.ppm, cell.sigma, t));
    const payload = randomBytes(rng, len);
    const frame = degrade(encodeSymbol(payload, { version, ecc }), { ppm: cell.ppm, sigma: cell.sigma, rng, ...cell.profile, ...cell.extra });
    const r = await decodeFrame(frame, { wasm, mode: cell.mode ?? "video" });
    if (r.kind === "found" && r.bytes.length === payload.length && r.bytes.every((v, i) => v === payload[i])) ok++;
  }
  const w = wilson(ok, cell.N);
  return { successes: ok, N: cell.N, rate: w.rate, lower: w.lower, upper: w.upper };
}
const report = (name: string, r: { successes: number; N: number; rate: number; lower: number }): void => {
  process.stdout.write(`[measured] ${name}: ${r.successes}/${r.N} rate=${r.rate.toFixed(3)} wilson_lower=${r.lower.toFixed(3)}\n`);
};

describe("asserted: Default_Cell under the Typical_Profile", () => {
  // Feature: symbols, Property 14: Default_Cell (v30 L, 1732 bytes, 4 ppm, blur 1) under the Typical_Profile, N = 200 fresh seeds, has a Wilson lower bound of at least 0.90 for screen and at least 0.97 for print
  it("P14: N = 200, blur 1, 4 ppm: Wilson lower bound >= 0.90 (screen) and >= 0.97 (print)", async () => {
    expect(DEFAULT.packetSize).toBe(1732);
    expect(DEFAULT.minPixelsPerModule).toBe(4);
    const r = await run({ label: "P14", N: 200, ppm: DEFAULT.minPixelsPerModule, sigma: 1, profile: TYPICAL });
    report("P14 Default_Cell v30 L 1732 B, 4 ppm, blur 1, Typical_Profile", r);
    process.stdout.write("[measured] spike baseline for this cell: 200/200 (Wilson lower 0.981)\n");
    // Global rule 9: a result that differs from the spike beyond the Wilson interval is a stop-and-report event.
    expect(r.upper, "rate differs from the spike's 200/200 beyond the Wilson interval").toBeGreaterThanOrEqual(0.981);
    expect(r.lower).toBeGreaterThanOrEqual(0.9);
    expect(r.lower).toBeGreaterThanOrEqual(0.97);
  }, 3_600_000);

  // Feature: symbols, Property 25: clean fixtures, every version 1..40 at each ecc, at 4 and 8 ppm (320 fixtures), decode to the input in 100% of cases
  it("P25: 320 clean fixtures decode to the input in 100% of cases", async () => {
    let ok = 0;
    let total = 0;
    const failures: string[] = [];
    for (let version = 1; version <= 40; version++) {
      for (const ecc of ["L", "M", "Q", "H"] as const) {
        const len = (QR_CAPACITY_BY_VERSION[version] as Record<EccLevel, number>)[ecc];
        const payload = randomBytes(mulberry32(hashSeed("measured-clean", version, ecc)), len);
        const m = encodeSymbol(payload, { version, ecc });
        for (const ppm of [4, 8]) {
          total++;
          const r = await decodeFrame(matrixToImageData(m, ppm, 4), { wasm });
          if (r.kind === "found" && r.bytes.length === len && r.bytes.every((v, i) => v === payload[i])) ok++;
          else failures.push(`v${version} ${ecc} ${ppm}ppm`);
        }
      }
    }
    const w = wilson(ok, total);
    process.stdout.write(`[measured] P25 clean fixtures: ${ok}/${total} wilson_lower=${w.lower.toFixed(3)} failures=${JSON.stringify(failures)}\n`);
    expect(total).toBe(320);
    expect(failures).toEqual([]);
  }, 3_600_000);
});

describe("informational: no assertion (R6.6)", () => {
  it("states what is asserted", () => {
    process.stdout.write("[measured] Only the Default_Cell cells under the Typical_Profile are asserted (R6.8, R6.9). All other output is informational.\n");
  });
  it("R6.10: Harsh_Profile, Default_Cell at 4 and 6 ppm and blur 0, 1, 1.5 (N = 200)", async () => {
    for (const ppm of [4, 6]) {
      for (const sigma of [0, 1, 1.5]) {
        report(`harsh ppm=${ppm} blur=${sigma}`, await run({ label: "harsh", N: 200, ppm, sigma, profile: HARSH }));
      }
    }
  }, 3_600_000);
  it("R6.11: 3 ppm at blur 1, Typical_Profile: a documented limit (spike: 0.26 to 0.45 at N = 100)", async () => {
    report("limit ppm=3 blur=1 typical", await run({ label: "limit3", N: 100, ppm: 3, sigma: 1, profile: TYPICAL }));
  }, 3_600_000);
  it("R6.2 to R6.5: Degradation_Family cells (Default_Cell at 6 ppm, blur 0, N = 50 each)", async () => {
    const base = { N: 50, ppm: 6, sigma: 0, profile: { ...TYPICAL, rotMax: 0, perspMax: 0, noise: 0, gradAmp: 0, contrast: 1 } };
    for (const deg of [0, 45, 90, 135, 180, 270]) report(`rotation ${deg} deg`, await run({ ...base, label: `rot${deg}`, extra: { rotationDeg: deg } }));
    for (const p of [0.04, 0.08, 0.12, 0.16]) report(`perspective max ${p}`, await run({ ...base, label: `persp${p}`, profile: { ...base.profile, perspMax: p } }));
    for (const s of [0.5, 1, 1.5, 2, 2.5]) report(`blur sigma ${s} px`, await run({ ...base, label: `blur${s}`, sigma: s }));
    for (const [c, n] of [[1, 0], [0.7, 0.04], [0.5, 0.08], [0.3, 0.08], [0.5, 0.12]] as const) {
      report(`contrast ${c} noise ${n}`, await run({ ...base, label: `bn${c}-${n}`, profile: { ...base.profile, contrast: c, noise: n } }));
    }
    for (const mode of ["block", "scattered"] as const) {
      for (const f of [0.02, 0.05, 0.1]) report(`occlusion ${mode} ${f}`, await run({ ...base, label: `occ${mode}${f}`, extra: { occlusion: { fraction: f, mode } } }));
    }
    report("inverted polarity, video mode", await run({ ...base, label: "inv-video", extra: { invert: true } }));
    report("inverted polarity, photo mode", await run({ ...base, label: "inv-photo", extra: { invert: true }, mode: "photo" }));
  }, 3_600_000);
});
