import { describe, expect, it } from "vitest";
import { RUNS, WARMUPS, measure } from "../perf/measure.js";
describe("Perf_Method (R7.5 to R7.7)", () => {
  it("runs 3 warm-ups and 20 timed runs, reports the median of exactly the 20 timed samples", async () => {
    let calls = 0;
    let clockReads = 0;
    let now = 0n;
    let nextDuration = 0n;
    const clock = () => {
      clockReads++;
      // every second read (the end read) advances by the next duration: timed run i lasts i + 1 ms
      if (clockReads % 2 === 0) now += nextDuration;
      return now;
    };
    const fn = () => {
      calls++;
      nextDuration = BigInt(Math.max(0, calls - WARMUPS)) * 1_000_000n;
    };
    const s = await measure(fn, clock);
    expect(WARMUPS).toBe(3);
    expect(RUNS).toBe(20);
    expect(calls).toBe(23);
    expect(clockReads).toBe(40); // warm-ups are not timed
    expect(s.samples.length).toBe(20);
    expect([...s.samples]).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(s.median).toBe(10.5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(20);
    expect(s.p95).toBe(19);
  });
});
