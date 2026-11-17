// (c, delta, D) sweep on the real implementation. Reports f_late, f_cold and R per K as the 0.99
// quantile and as the 0.995 calibration quantile (the table value), plus the dense next() cost.
// It only measures and recommends; nothing is frozen and no table is written.
import { type CalibrationOptions, calibrate, type KResult } from "./calibrate.js";
import { type DenseCost, measureDenseNext, ONE_MIB, renderDenseCost, THIRTY_TWO_MIB_PAYLOAD } from "./dense-cost.js";
import { renderTable } from "./calibrate.js";
import type { FormatParams } from "../src/format.js";

export const SWEEP_PAIRS: ReadonlyArray<{ c: readonly [number, number]; delta: readonly [number, number] }> = [
  { c: [1, 10], delta: [1, 2] },
  { c: [3, 100], delta: [1, 2] },
];
export const SWEEP_DS = [0, 8, 4, 3] as const;
export const SWEEP_KS = [50, 100, 500] as const;
export const SWEEP_SAMPLES: Readonly<Record<number, number>> = { 50: 1000, 100: 1000, 500: 300 };

export function sweepFormats(): FormatParams[] {
  return SWEEP_PAIRS.flatMap((p) => SWEEP_DS.map((D) => ({ c: p.c, delta: p.delta, D })));
}

export interface ComboResult {
  readonly format: FormatParams;
  readonly results: readonly KResult[];
  readonly dense1MiB: DenseCost | null;
  readonly dense32MiB: DenseCost | null;
  readonly sumFCold: number;
  readonly sumFLate: number;
  readonly sumR: number;
}

export interface SweepOptions {
  readonly formats?: readonly FormatParams[];
  readonly Ks?: readonly number[];
  readonly samples?: Readonly<Record<number, number>>;
  readonly measureDense?: boolean;
  readonly log?: (line: string) => void;
}

export interface SweepResult {
  readonly combos: readonly ComboResult[];
  readonly wallSeconds: number;
  readonly recommended: ComboResult | undefined;
}

/** Lowest summed f_cold, tie-break lowest summed f_late, then lowest dense cost at K = 359. */
export function recommend(combos: readonly ComboResult[]): ComboResult | undefined {
  const cost = (c: ComboResult): number => c.dense1MiB?.medianMs ?? 0;
  return [...combos].sort((a, b) => a.sumFCold - b.sumFCold || a.sumFLate - b.sumFLate || cost(a) - cost(b))[0];
}

export async function runSweep(options: SweepOptions = {}): Promise<SweepResult> {
  const formats = options.formats ?? sweepFormats();
  const Ks = options.Ks ?? SWEEP_KS;
  const samples = options.samples ?? SWEEP_SAMPLES;
  const log = options.log ?? (() => undefined);
  const start = process.hrtime.bigint();
  const combos: ComboResult[] = [];
  for (const format of formats) {
    const cal: CalibrationOptions = { format, Ks, samples };
    const t0 = process.hrtime.bigint();
    const results = await calibrate(cal);
    const dense1MiB = options.measureDense === false ? null : await measureDenseNext(ONE_MIB, format.D);
    const dense32MiB = options.measureDense === false ? null : await measureDenseNext(THIRTY_TWO_MIB_PAYLOAD, format.D);
    const sum = (f: (r: KResult) => number): number => results.reduce((s, r) => s + f(r), 0);
    const combo: ComboResult = {
      format,
      results,
      dense1MiB,
      dense32MiB,
      sumFCold: sum((r) => r.fColdPermille),
      sumFLate: sum((r) => r.fLatePermille),
      sumR: sum((r) => r.R),
    };
    combos.push(combo);
    log(`done c=${format.c.join("/")} delta=${format.delta.join("/")} D=${format.D} in ${(Number(process.hrtime.bigint() - t0) / 1e9).toFixed(0)} s`);
  }
  return { combos, wallSeconds: Number(process.hrtime.bigint() - start) / 1e9, recommended: recommend(combos) };
}

const label = (f: FormatParams): string => `c=${f.c[0]}/${f.c[1]} delta=${f.delta[0]}/${f.delta[1]} D=${f.D === 0 ? "none" : f.D}`;

export function renderSweep(sweep: SweepResult, samples: Readonly<Record<number, number>> = SWEEP_SAMPLES): string {
  const lines: string[] = [];
  lines.push(`Trials per K: ${Object.entries(samples).map(([k, n]) => `K=${k}: N=${n}`).join(", ")}. Fixed seed. Loss: M2 0.30, M3 0.05.`);
  lines.push("Factors are f_late, f_cold (packets / K) and R (repair packets) at the 0.99 quantile and at the 0.995 calibration quantile (table value).");
  lines.push("");
  for (const c of sweep.combos) {
    lines.push(`=== ${label(c.format)} ===`);
    lines.push(renderTable(c.format, c.results));
    lines.push(renderDenseCost(c.dense1MiB, "dense cost, 1 MiB"));
    lines.push(renderDenseCost(c.dense32MiB, "dense cost, 32 MiB (informational)"));
    lines.push("");
  }
  lines.push("Summary (sums over the three K, 0.995 quantile): combination | sum f_cold | sum f_late | sum R | dense next() at K=359");
  for (const c of sweep.combos) {
    const mark = c === sweep.recommended ? "  <-- lowest sum f_cold (rule)" : "";
    lines.push(
      `${label(c.format).padEnd(34)} | ${(c.sumFCold / 1000).toFixed(3).padStart(7)} | ${(c.sumFLate / 1000).toFixed(3).padStart(7)} | ${String(c.sumR).padStart(5)} | ${c.dense1MiB ? c.dense1MiB.medianMs.toFixed(3) + " ms" : "n/a"}${mark}`,
    );
  }
  lines.push("");
  const r = sweep.recommended;
  lines.push(r ? `Rule-based recommendation: ${label(r.format)}` : "No combinations ran.");
  lines.push(`Wall-clock for the full sweep: ${sweep.wallSeconds.toFixed(0)} s`);
  return lines.join("\n");
}
