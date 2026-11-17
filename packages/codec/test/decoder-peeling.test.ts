import { describe, expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { decodePacket } from "../src/packet.js";

const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const payload = (n: number, name = "p") => ({ bytes: bytesOf(n, n + 11), name, mime: "" });
const small = { packetSize: 46 };
const noDense = { ...DEFAULT_FORMAT, D: 0 };

describe("peeling (R5.7, R5.16)", () => {
  it("solves every Block from systematic packets alone, with no equations left and no Gaussian call", async () => {
    let gauss = 0;
    const e = await encodeWith(payload(300), small, { format: noDense });
    const d = createDecoderWith({}, noDense, { onGauss: () => gauss++ });
    for (let i = 0; i < e.K; i++) await d.push(e.next());
    expect(d.progress().solvedBlocks).toBe(e.K);
    expect(d.debug().liveEquations).toBe(0);
    expect(gauss).toBe(0);
  });

  it("recovers dropped systematic Blocks from sparse repair packets by peeling only, with correct values", async () => {
    let gauss = 0;
    const e = await encodeWith(payload(400), small, { format: noDense });
    const K = e.K;
    const probe = await encodeWith(payload(400), small, { format: noDense });
    const truth = Array.from({ length: K }, () => decodePacket(probe.next()).payload.slice());
    const d = createDecoderWith({}, noDense, { onGauss: () => gauss++ });
    const packets = Array.from({ length: K }, () => e.next());
    const dropped = new Set([1, 4, 6, 9, 13, 20]);
    for (let i = 0; i < K; i++) if (!dropped.has(i)) await d.push(packets[i] as Uint8Array);
    expect(d.progress().solvedBlocks).toBe(K - dropped.size);
    let n = 0;
    while (d.progress().solvedBlocks < K && n < 40 * K) {
      const s = await d.push(e.next());
      expect(s.kind).toBe("accepted");
      n++;
    }
    expect(d.progress().solvedBlocks).toBe(K);
    expect(d.debug().liveEquations).toBe(0);
    for (let i = 0; i < K; i++) expect(d.peekBlock(i)).toEqual(truth[i]);
    expect(gauss).toBe(0);
  });

  it("solves a chain: a repair packet that becomes degree 1 after other Blocks arrive", async () => {
    const e = await encodeWith(payload(200), small, { format: noDense });
    const K = e.K;
    const d = createDecoderWith({}, noDense);
    const sys = Array.from({ length: K }, () => e.next());
    const repair = Array.from({ length: Math.floor(K / 2) }, () => e.next());
    // Repair packets first (stored as equations), then the systematic ones peel everything.
    for (const r of repair) await d.push(r);
    const before = d.progress().solvedBlocks;
    const stored = d.debug().liveEquations;
    for (const s of sys) await d.push(s);
    expect(before).toBeLessThan(K);
    expect(stored).toBeGreaterThan(0);
    expect(d.progress().solvedBlocks).toBe(K);
    expect(d.debug().liveEquations).toBe(0);
  });
});

describe("residual above the Gaussian cap (R5.15)", () => {
  it("keeps collecting without errors or rejected statuses, and still finishes by peeling", async () => {
    const e = await encodeWith(payload(500), small, { format: noDense });
    const K = e.K;
    for (let i = 0; i < K; i++) e.next(); // only repair packets are sent
    const d = createDecoderWith({ maxGaussianBlocks: 0 }, noDense);
    let n = 0;
    let stalled = false;
    while (d.progress().solvedBlocks < K && n < 60 * K) {
      const s = await d.push(e.next());
      expect(s.kind).not.toBe("rejected");
      n++;
      if (d.debug().liveEquations > 0 && d.progress().solvedBlocks === 0) stalled = true;
    }
    expect(stalled).toBe(true); // it sat at residual K for a while, with no error
    expect(d.progress().solvedBlocks).toBe(K);
    expect(d.debug().liveEquations).toBe(0);
  });
});

describe("bookkeeping", () => {
  it("counts solved Blocks once and keeps equation ids bounded under heavy churn", async () => {
    const e = await encodeWith(payload(600), small, { format: noDense });
    const K = e.K;
    const d = createDecoderWith({}, noDense);
    const sys = Array.from({ length: K }, () => e.next());
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 2 * K; i++) await d.push(e.next());
    }
    for (const s of sys) await d.push(s);
    expect(d.progress().solvedBlocks).toBe(K);
    expect(d.debug().liveEquations).toBe(0);
    expect(d.debug().solved.every((v) => v === 1)).toBe(true);
  });
});
