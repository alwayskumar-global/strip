// Perf_Method (requirements glossary): median of 20 runs after 3 warm-ups, timed with process.hrtime.bigint.
// The clock is injectable so the method itself is unit-tested. Perf scripts live outside src, so reading time is allowed.
export type Clock = () => bigint;
export const WARMUPS = 3;
export const RUNS = 20;
export type Stats = { readonly median: number; readonly p95: number; readonly min: number; readonly max: number; readonly samples: readonly number[] };

export async function measure(fn: () => unknown, clock: Clock = () => process.hrtime.bigint()): Promise<Stats> {
  for (let i = 0; i < WARMUPS; i++) await fn();
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = clock();
    await fn();
    samples.push(Number(clock() - t0) / 1e6);
  }
  const s = [...samples].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { median: ((s[mid - 1] as number) + (s[mid] as number)) / 2, p95: s[18] as number, min: s[0] as number, max: s[19] as number, samples };
}
export const fmt = (s: Stats): string =>
  `median ${s.median.toFixed(2)} ms, p95 ${s.p95.toFixed(2)} ms (min ${s.min.toFixed(2)}, max ${s.max.toFixed(2)}; ${WARMUPS} warm-ups, ${RUNS} timed runs)`;
export const MACHINE = "Reference_Machine: Apple M2 Pro, Node 25.9 (budgets are stated for this machine)";
