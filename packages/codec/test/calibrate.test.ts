import { DENSE_PERIOD } from "../src/constants.js";
import { describe, expect, it } from "vitest";
import { parseArgs, parseRational, runCli, TABLE_KS, wilsonLower, type CalibrationOptions, type KResult } from "../perf/calibrate.js";

const SMALL = "--c 1/10 --delta 1/2 --D 4 --K 10,25 --samples 20";

function fake(K: number, over: Partial<KResult> = {}): KResult {
  const q = { q99: 1, qTable: 1, rateTable: 1, wilsonTable: 0.9 };
  return { K, N: 5, quantile: 0.999, late: q, cold: q, page: q, fLatePermille: 1500, fColdPermille: 2000, R: K, fLate99Permille: 1400, fCold99Permille: 1900, R99: K - 1, ...over };
}

describe("calibration determinism (R10.4)", () => {
  it("two runs with identical arguments give identical output and table", async () => {
    const a = await runCli(SMALL);
    const b = await runCli(SMALL);
    expect(b.text).toBe(a.text);
    expect(JSON.stringify(b.table)).toBe(JSON.stringify(a.table));
    expect(a.table.rows.map((r) => r.K)).toEqual([10, 25]);
    for (const r of a.results) {
      expect(r.N).toBe(20);
      expect(r.fLatePermille).toBeGreaterThanOrEqual(1000);
      expect(r.fColdPermille).toBeGreaterThanOrEqual(1000);
      expect(r.R).toBeGreaterThanOrEqual(0);
    }
  }, 120000);

  it("a different D or a different seed changes the run", async () => {
    const a = await runCli(SMALL);
    const other = await runCli(SMALL.replace("--D 4", "--D none"));
    expect(other.table.D).toBe(0);
    expect(other.text).not.toBe(a.text);
    const seeded = await runCli(SMALL + " --seed 12345");
    expect(seeded.text).not.toBe(a.text);
  }, 120000);
});

describe("the written JSON records c, delta and D (R10.7)", () => {
  const full = async (o: CalibrationOptions): Promise<KResult[]> => o.Ks.map((K) => fake(K, { quantile: o.quantiles?.[K] ?? 0.995 }));
  const all = TABLE_KS.join(",");

  it("passes the command-line values through to the file", async () => {
    let written = "";
    const out = await runCli(`--c 3/100 --delta 1/10 --D 8 --K ${all} --samples 5 --write`, (j) => (written = j), full);
    const file = JSON.parse(written) as { c: number[]; delta: number[]; D: number; quantile?: string; rows: Array<{ K: number; N: number; quantile: string }> };
    expect(file.c).toEqual([3, 100]);
    expect(file.delta).toEqual([1, 10]);
    expect(file.D).toBe(8);
    expect(file.quantile).toBeUndefined(); // the quantile is per row
    expect(file.rows.every((r) => r.quantile === "0.995")).toBe(true);
    expect(file.rows.every((r) => r.N === 5)).toBe(true);
    expect(file.rows.map((r) => r.K)).toEqual([...TABLE_KS]);
    expect(out.table.D).toBe(8);
    expect(written.endsWith("\n")).toBe(true);
  });

  it("D none is recorded as 0, decimals become rationals", async () => {
    let written = "";
    await runCli(`--c 0.03 --delta 0.5 --D none --K ${all} --samples 5 --write`, (j) => (written = j), full);
    const file = JSON.parse(written) as { c: number[]; delta: number[]; D: number };
    expect(file.c).toEqual([3, 100]);
    expect(file.delta).toEqual([1, 2]);
    expect(file.D).toBe(0);
  });

  it("writes nothing without --write, and refuses a partial K list", async () => {
    let calls = 0;
    await runCli(`--K ${all} --samples 5`, () => calls++, full);
    expect(calls).toBe(0);
    await expect(runCli("--K 10,25 --samples 5 --write", () => calls++, full)).rejects.toThrow(/partial/);
    expect(calls).toBe(0);
  });

  it("an infinite quantile fails the run and writes nothing", async () => {
    let calls = 0;
    const inf = { q99: 1, qTable: Number.POSITIVE_INFINITY, rateTable: 1, wilsonTable: 0 };
    const bad = async (o: CalibrationOptions): Promise<KResult[]> => o.Ks.map((K) => fake(K, K === 100 ? { cold: inf } : {}));
    await expect(runCli(`--K ${all} --samples 5 --write`, () => calls++, bad)).rejects.toThrow(/K=100/);
    expect(calls).toBe(0);
  });
});

describe("argument parsing", () => {
  it("parses rationals and decimals", () => {
    expect(parseRational("1/10")).toEqual([1, 10]);
    expect(parseRational("0.5")).toEqual([1, 2]);
    expect(parseRational("0.03")).toEqual([3, 100]);
    expect(() => parseRational("abc")).toThrow();
    expect(() => parseRational("0")).toThrow();
  });
  it("supports a per-K sample map, defaults and rejects junk", () => {
    const a = parseArgs("--K 50,100,500 --samples 50:1000,100:1000,500:300");
    expect(a.samples).toEqual({ 50: 1000, 100: 1000, 500: 300 });
    expect(a.format.D).toBe(DENSE_PERIOD);
    expect(parseArgs("").Ks).toEqual([...TABLE_KS]);
    expect(() => parseArgs("--K 1")).toThrow();
    expect(() => parseArgs("--D -1")).toThrow();
    expect(() => parseArgs("bogus")).toThrow();
  });
  it("wilson lower bound matches the formula at n = 1000, p = 0.99", () => {
    expect(wilsonLower(990, 1000)).toBeCloseTo(0.9818, 3);
    expect(wilsonLower(0, 0)).toBe(0);
  });
});

describe("per-row quantile and merge", () => {
  it("parses a quantile map and a global quantile", () => {
    expect(parseArgs("--K 10,25 --quantile 10:0.999,25:0.995").quantiles).toEqual({ 10: 0.999, 25: 0.995 });
    expect(parseArgs("--K 10,25 --quantile 0.999").quantiles).toEqual({ 10: 0.999, 25: 0.999 });
    expect(parseArgs("--K 10").quantiles).toEqual({ 10: 0.995 });
    expect(() => parseArgs("--quantile 1.5")).toThrow();
  });

  it("each recalibrated row records its own quantile and N", async () => {
    const out = await runCli("--K 10,25 --samples 10:40,25:20 --quantile 10:0.999,25:0.995");
    expect(out.table.rows.map((r) => [r.K, r.N, r.quantile])).toEqual([[10, 40, "0.999"], [25, 20, "0.995"]]);
    expect("quantile" in out.table).toBe(false);
  }, 120000);

  it("the quantile changes the value: 0.999 is the sample maximum for N = 40", async () => {
    const hi = await runCli("--K 10 --samples 40 --quantile 0.999");
    const lo = await runCli("--K 10 --samples 40 --quantile 0.5");
    expect(hi.results[0]?.late.qTable).toBeGreaterThanOrEqual(lo.results[0]?.late.qTable ?? 0);
    expect(hi.results[0]?.fColdPermille).toBeGreaterThanOrEqual(lo.results[0]?.fColdPermille ?? 0);
  }, 120000);

  it("--merge replaces only the recalibrated rows and keeps the others, adding the old top-level quantile", async () => {
    const existing = JSON.stringify({
      formatVersion: 1,
      c: [1, 10],
      delta: [1, 2],
      D: 3,
      quantile: "0.995",
      rows: TABLE_KS.map((K) => ({ K, N: 300, fLatePermille: 1500, fColdPermille: 2000, R: K })),
    });
    let written = "";
    const full = async (o: CalibrationOptions): Promise<KResult[]> => o.Ks.map((K) => fake(K, { fLatePermille: 1111, N: 77 }));
    await runCli("--c 1/10 --delta 1/2 --D 3 --K 10,25 --samples 77 --quantile 0.999 --merge --write", (j) => (written = j), full, undefined, existing);
    const t = JSON.parse(written) as { rows: Array<{ K: number; N: number; quantile: string; fLatePermille: number }> };
    expect(t.rows.map((r) => r.K)).toEqual([...TABLE_KS]);
    expect(t.rows[0]).toMatchObject({ K: 10, N: 77, quantile: "0.999", fLatePermille: 1111 });
    expect(t.rows[1]).toMatchObject({ K: 25, N: 77, quantile: "0.999", fLatePermille: 1111 });
    expect(t.rows[2]).toMatchObject({ K: 50, N: 300, quantile: "0.995", fLatePermille: 1500 });
    expect(t.rows[10]).toMatchObject({ K: 16384, N: 300, quantile: "0.995" });
  });

  it("--merge refuses a table calibrated with different constants, and --write still needs a full grid", async () => {
    const other = JSON.stringify({ formatVersion: 1, c: [1, 10], delta: [1, 2], D: 4, rows: [] });
    const full = async (o: CalibrationOptions): Promise<KResult[]> => o.Ks.map((K) => fake(K));
    await expect(runCli("--D 3 --K 10 --samples 5 --merge", undefined, full, undefined, other)).rejects.toThrow(/different/);
    const partial = JSON.stringify({ formatVersion: 1, c: [1, 10], delta: [1, 2], D: 3, rows: [{ K: 10, N: 1, quantile: "0.995", fLatePermille: 1, fColdPermille: 1, R: 0 }] });
    await expect(runCli("--D 3 --K 10 --samples 5 --merge --write", () => undefined, full, undefined, partial)).rejects.toThrow(/partial/);
  });
});
