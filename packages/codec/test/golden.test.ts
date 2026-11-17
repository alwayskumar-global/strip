import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DENSE_PERIOD, SOLITON_C, SOLITON_DELTA } from "../src/constants.js";
import { crc32 } from "../src/crc32.js";
import { createDecoder, encode } from "../src/index.js";
import { serializeMetadata } from "../src/metadata.js";
import { isDense, Neighbors, rowWords } from "../src/neighbors.js";
import { sha256WebCrypto } from "../src/hash.js";
import { Prng, seed32 } from "../src/prng.js";
import { getSolitonTable } from "../src/soliton.js";

// vectors.json is produced by the independent Python reference in test/golden/reference/generate.py
// (written from design.md only). Never regenerate it silently: a difference is a finding, not a fix.
interface Vectors {
  formatVersion: number;
  params: { c: [number, number]; delta: [number, number]; D: number };
  crc32: Array<{ asciiHex: string; crc: number }>;
  prng: Array<{ session: number; seq: number; seed: number; state: number[]; out: number[] }>;
  bounded: Array<{ session: number; seq: number; ns: number[]; values: number[] }>;
  soliton: Array<{ K: number; cumT: number[] }>;
  solitonDigests: Array<{ K: number; sha256: string }>;
  denseReference: Array<{ session: number; seq: number; K: number; words: number[]; set: number[] }>;
  neighborSets: Array<{ session: number; K: number; seq: number; kind: string; set: number[] }>;
  cases: Array<{
    name: string;
    payloadHex: string;
    fileName: string;
    mime: string;
    packetSize: number;
    sessionId: number;
    recordHex: string;
    totalLength: number;
    blockSize: number;
    K: number;
    packets: Array<{ seq: number; kind: string; hex: string }>;
  }>;
}

const v = JSON.parse(readFileSync(`${process.cwd()}/test/golden/vectors.json`, "utf8")) as Vectors;
const fromHex = (h: string): Uint8Array => Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16));
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

describe("golden vectors from the independent Python reference (R6.3, R6.4)", () => {
  it("were generated with the frozen format constants", () => {
    expect(v.formatVersion).toBe(1);
    expect(v.params.c).toEqual([...SOLITON_C]);
    expect(v.params.delta).toEqual([...SOLITON_DELTA]);
    expect(v.params.D).toBe(DENSE_PERIOD);
  });

  it("CRC-32 vectors", () => {
    expect(v.crc32.length).toBeGreaterThanOrEqual(4);
    for (const r of v.crc32) expect(crc32(fromHex(r.asciiHex))).toBe(r.crc);
  });

  it("PRNG seeds, states and outputs", () => {
    expect(v.prng.length).toBeGreaterThanOrEqual(6);
    for (const r of v.prng) {
      expect(seed32(r.session, r.seq)).toBe(r.seed);
      const p = new Prng(r.session, r.seq);
      expect(p.state()).toEqual(r.state);
      expect(Array.from({ length: r.out.length }, () => p.next())).toEqual(r.out);
    }
  });

  it("bounded() including the n = 1 and n = 2^32 edges", () => {
    for (const r of v.bounded) {
      const p = new Prng(r.session, r.seq);
      expect(r.ns.map((n) => p.bounded(n))).toEqual(r.values);
    }
  });

  it("soliton tables: full cumT for small K, digests for large K", async () => {
    for (const r of v.soliton) expect(Array.from(getSolitonTable(r.K).cumT)).toEqual(r.cumT);
    const enc = new TextEncoderLike();
    for (const r of v.solitonDigests) {
      const t = getSolitonTable(r.K).cumT;
      const text = Array.from(t.subarray(1), (x) => String(x)).join(",");
      expect(toHex(await sha256WebCrypto(enc.encode(text)))).toBe(r.sha256);
    }
  });

  it("the four dense reference-vector rows, words and Block sets", () => {
    expect(v.denseReference.length).toBe(4);
    for (const r of v.denseReference) {
      const n = new Neighbors(r.K, getSolitonTable(r.K), DENSE_PERIOD);
      expect(Array.from(n.rawDenseWords(r.session, r.seq))).toEqual(r.words);
      const row = new Uint32Array(rowWords(r.K));
      n.denseRow(r.session, r.seq, row);
      const set: number[] = [];
      for (let b = 0; b < r.K; b++) if (((row[b >>> 5] as number) >>> (b & 31)) & 1) set.push(b);
      expect(set).toEqual(r.set);
    }
  });

  it("neighbor sets for systematic, sparse and dense packets (the vector deferred from the design)", () => {
    const kinds = new Set(v.neighborSets.map((r) => r.kind));
    expect([...kinds].sort()).toEqual(["dense", "sparse", "systematic"]);
    for (const r of v.neighborSets) {
      const n = new Neighbors(r.K, getSolitonTable(r.K), DENSE_PERIOD);
      const out = new Uint32Array(r.K);
      const count = n.select(r.session, r.seq, out);
      expect(Array.from(out.subarray(0, count)).sort((a, b) => a - b), `K=${r.K} seq=${r.seq}`).toEqual(r.set);
      const kind = r.seq < r.K ? "systematic" : isDense(r.seq, r.K, DENSE_PERIOD) ? "dense" : "sparse";
      expect(kind).toBe(r.kind);
    }
  });

  for (const c of v.cases) {
    it(`case ${c.name}: encoder output is byte-identical to the reference, packet for packet`, async () => {
      const payload = fromHex(c.payloadHex);
      const e = await encode({ bytes: payload, name: c.fileName, mime: c.mime }, { packetSize: c.packetSize });
      expect(e.sessionId).toBe(c.sessionId);
      expect(e.K).toBe(c.K);
      expect(e.blockSize).toBe(c.blockSize);
      expect(e.totalLength).toBe(c.totalLength);
      const record = serializeMetadata({ name: c.fileName, mime: c.mime, byteLength: payload.length, sha256: await sha256WebCrypto(payload) });
      expect(toHex(record)).toBe(c.recordHex);
      const got = c.packets.map(() => toHex(e.next()));
      expect(got.length).toBe(c.packets.length);
      c.packets.forEach((p, i) => expect(got[i], `seq ${p.seq} (${p.kind})`).toBe(p.hex));
      expect(new Set(c.packets.map((p) => p.kind)).has("dense")).toBe(true);
      expect(new Set(c.packets.map((p) => p.kind)).has("sparse")).toBe(true);
    });

    it(`case ${c.name}: the reference packets decode back to the payload`, async () => {
      const d = createDecoder();
      for (const p of c.packets) await d.push(fromHex(p.hex));
      expect(d.progress().complete).toBe(true);
      expect(toHex(d.result().payload)).toBe(c.payloadHex);
      expect(d.result().metadata.name).toBe(c.fileName);
    });
  }
});

/** Minimal ASCII encoder: the digest text is ASCII, and TextEncoder is not in the ES2023 lib. */
class TextEncoderLike {
  encode(s: string): Uint8Array {
    return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
  }
}
