import { describe, expect, it } from "vitest";
import { createDecoder, encode, type PayloadInput } from "../src/index.js";
import { createDecoderWith } from "../src/decoder.js";
import { isDense } from "../src/neighbors.js";
import { decodePacket } from "../src/packet.js";
import { DEFAULT_FORMAT } from "../src/format.js";

const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const file = (n: number, name = "f.bin", mime = "application/octet-stream"): PayloadInput => ({ bytes: bytesOf(n, n + 21), name, mime });

describe("round trips through the public API (R2.5, R5.12)", () => {
  it("all systematic packets, default packet size", async () => {
    const p = file(60000, "big.dat");
    const e = await encode(p);
    const d = createDecoder();
    for (let i = 0; i < e.K; i++) await d.push(e.next());
    expect(d.result().payload).toEqual(p.bytes);
    expect(d.result().metadata.name).toBe("big.dat");
  });

  it("the empty payload, K = 1, and the tiny blockSize (packetSize 46)", async () => {
    for (const [p, opts] of [
      [{ bytes: new Uint8Array(0), name: "empty", mime: "" }, undefined],
      [file(1, "one"), undefined],
      [file(333, "tiny"), { packetSize: 46 }],
    ] as const) {
      const e = await encode(p, opts);
      const d = createDecoder();
      for (let i = 0; i < e.K; i++) await d.push(e.next());
      expect(d.result().payload).toEqual(p.bytes);
    }
  });

  it("dropped and duplicated packets, order shuffled by a deterministic permutation", async () => {
    const p = file(5000, "shuffled");
    const e = await encode(p, { packetSize: 100 });
    const K = e.K;
    const stream = Array.from({ length: 3 * K }, () => e.next());
    const kept = stream.filter((_, i) => i % 4 !== 1); // drop a quarter
    const order = kept.map((_, i) => i).sort((a, b) => ((a * 7919) % 1009) - ((b * 7919) % 1009));
    const d = createDecoder();
    for (const i of order) {
      await d.push(kept[i] as Uint8Array);
      await d.push(kept[i] as Uint8Array); // duplicate
      if (d.progress().complete) break;
    }
    expect(d.progress().complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
  });

  it("a foreign session interleaved with the real one changes nothing", async () => {
    const p = file(2000, "mine");
    const e = await encode(p, { packetSize: 80 });
    const other = await encode(file(2000, "theirs"), { packetSize: 80 });
    const d = createDecoder();
    let ignored = 0;
    for (let i = 0; i < e.K; i++) {
      await d.push(e.next());
      const s = await d.push(other.next());
      if (s.kind === "ignored" && s.reason === "SESSION_MISMATCH") ignored++;
      if (d.progress().complete) break;
    }
    expect(d.result().payload).toEqual(p.bytes);
    expect(ignored).toBeGreaterThan(0);
  });

  it("a corrupted packet is rejected and the stream still decodes", async () => {
    const p = file(1500, "corrupt");
    const e = await encode(p, { packetSize: 80 });
    const d = createDecoder();
    let rejected = 0;
    for (let i = 0; i < 2 * e.K && !d.progress().complete; i++) {
      const pk = e.next();
      if (i % 5 === 2) {
        const bad = pk.slice();
        bad[30 + (i % 20)] = (bad[30 + (i % 20)] as number) ^ (1 << (i % 8));
        const s = await d.push(bad);
        if (s.kind === "rejected") rejected++;
      }
      await d.push(pk);
    }
    expect(rejected).toBeGreaterThan(0);
    expect(d.result().payload).toEqual(p.bytes);
  });
});

describe("mixed systematic, sparse and dense packets (R2.2, R5.18, R5.23)", () => {
  it("recovers from a stream where systematic packets were lost and repair packets are a sparse and dense mix", async () => {
    const p = file(40000, "mixed");
    const e = await encode(p, { packetSize: 200 });
    const K = e.K;
    const d = createDecoder();
    let sparse = 0;
    let dense = 0;
    for (let i = 0; i < K; i++) {
      const pk = e.next();
      if (i % 3 !== 0) await d.push(pk); // lose a third of the systematic packets
    }
    for (let i = 0; i < 6 * K && !d.progress().complete; i++) {
      const pk = e.next();
      if (isDense(decodePacket(pk).seq, K, DEFAULT_FORMAT.D)) dense++;
      else sparse++;
      await d.push(pk);
    }
    expect(d.progress().complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
    expect(dense).toBeGreaterThan(0);
    expect(sparse).toBeGreaterThan(0);
  });

  it("recovery depends on dense rows: with only dense repair packets, a lost third is still recovered by Gaussian elimination", async () => {
    const p = file(40000, "dense-only");
    const e = await encode(p, { packetSize: 200 });
    const K = e.K;
    let attempts = 0;
    const d = createDecoderWith({}, DEFAULT_FORMAT, { onGauss: () => attempts++ });
    for (let i = 0; i < K; i++) {
      const pk = e.next();
      if (i % 3 !== 0) await d.push(pk);
    }
    let sent = 0;
    while (!d.progress().complete && sent < 4 * K) {
      const pk = e.next();
      if (!isDense(decodePacket(pk).seq, K, DEFAULT_FORMAT.D)) continue; // sparse repair packets are withheld
      await d.push(pk);
      sent++;
    }
    expect(d.progress().complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
    expect(attempts).toBeGreaterThan(0);
  });

  it("a dense-only repair set with every systematic packet present completes without needing the repair packets", async () => {
    const p = file(9000, "all-sys");
    const e = await encode(p, { packetSize: 120 });
    const K = e.K;
    const d = createDecoder();
    const sys = Array.from({ length: K }, () => e.next());
    for (let i = 0; i < K; i++) {
      const pk = e.next();
      if (isDense(decodePacket(pk).seq, K, DEFAULT_FORMAT.D)) await d.push(pk); // dense rows arrive first
    }
    for (const s of sys) await d.push(s);
    expect(d.progress().complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
  });
});
