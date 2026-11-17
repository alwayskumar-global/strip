import { describe, expect, it } from "vitest";
import { createDecoder, createDecoderWith } from "../src/decoder.js";
import { encode, encodeWith, type PayloadInput } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { computeDigest, sha256WebCrypto } from "../src/hash.js";
import { serializeMetadata } from "../src/metadata.js";
import { decodePacket, encodePacket } from "../src/packet.js";

const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const payload = (n: number, name = "p.bin", mime = "application/x-test"): PayloadInput => ({ bytes: bytesOf(n, n + 9), name, mime });
const small = { packetSize: 46 };
const allDense = { ...DEFAULT_FORMAT, D: 1 };
const noDense = { ...DEFAULT_FORMAT, D: 0 };

describe("completion and the hash gate (R5.10, R5.12, R5.13)", () => {
  it("completes from systematic packets; result() returns identical bytes and metadata", async () => {
    const p = payload(1234);
    const e = await encode(p, small);
    const d = createDecoder();
    expect(() => d.result()).toThrowError(/not complete/);
    let last;
    for (let i = 0; i < e.K; i++) last = await d.push(e.next());
    expect(last).toMatchObject({ kind: "accepted" });
    expect(last?.progress.complete).toBe(true);
    const r = d.result();
    expect(r.payload).toEqual(p.bytes);
    expect(r.metadata.name).toBe(p.name);
    expect(r.metadata.mime).toBe(p.mime);
    expect(r.metadata.byteLength).toBe(p.bytes.length);
    expect(r.metadata.sha256).toEqual(await sha256WebCrypto(p.bytes));
  });

  it("result() throws INCOMPLETE_DECODE before completion and returns nothing", async () => {
    const e = await encode(payload(300), small);
    const d = createDecoder();
    await d.push(e.next());
    try {
      d.result();
      expect.unreachable();
    } catch (err) {
      expect((err as { code?: string }).code).toBe("INCOMPLETE_DECODE");
    }
  });

  it("round trips an empty payload, K = 1, and the default packet size", async () => {
    for (const [p, opts] of [
      [{ bytes: new Uint8Array(0), name: "empty", mime: "" }, small],
      [payload(1), {}],
      [payload(5000), {}],
    ] as const) {
      const e = await encode(p, opts);
      const d = createDecoder();
      for (let i = 0; i < e.K; i++) await d.push(e.next());
      expect(d.result().payload).toEqual(p.bytes);
    }
  });

  it("does not expose bytes until the asynchronous hash resolves", async () => {
    const e = await encode(payload(200), small);
    let resolveHash!: () => void;
    const slow = (data: Uint8Array) =>
      new Promise<Uint8Array>((resolve) => {
        resolveHash = () => {
          void Promise.resolve(sha256WebCrypto(data)).then(resolve);
        };
      });
    const d = createDecoder({ hash: slow });
    for (let i = 0; i < e.K - 1; i++) await d.push(e.next());
    const pending = d.push(e.next());
    await new Promise<void>((r) => setTimeout(() => r(), 5));
    expect(d.progress().complete).toBe(false);
    expect(() => d.result()).toThrow();
    resolveHash();
    const s = await pending;
    expect(s.progress.complete).toBe(true);
    expect(d.result().payload.length).toBe(200);
  });
});

describe("HASH_MISMATCH (R5.11, R5.23)", () => {
  it("is reported when the digest in the record is not the digest of the bytes; bytes stay withheld", async () => {
    const liar = () => new Uint8Array(32).fill(7); // encoder embeds a wrong digest
    const e = await encode(payload(150), { ...small, hash: liar });
    const d = createDecoder();
    let last;
    for (let i = 0; i < e.K; i++) last = await d.push(e.next());
    expect(last).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
    expect(d.progress().complete).toBe(false);
    expect(() => d.result()).toThrow();
    // terminal: further packets are rejected the same way
    expect(await d.push(e.next())).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
    expect(() => d.result()).toThrow();
  });

  it("also holds when the bytes were recovered through dense rows", async () => {
    const liar = () => new Uint8Array(32).fill(9);
    const e = await encodeWith(payload(300), { ...small, hash: liar }, { format: allDense });
    const K = e.K;
    const d = createDecoderWith({}, allDense);
    const sys = Array.from({ length: K }, () => e.next());
    for (let i = 0; i < K; i++) if (i % 5 !== 0) await d.push(sys[i] as Uint8Array);
    let last;
    for (let i = 0; i < 6 * K && d.progress().solvedBlocks < K; i++) last = await d.push(e.next());
    expect(last).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
    expect(() => d.result()).toThrow();
  });

  it("a decoder-side wrong digest also fails", async () => {
    const e = await encode(payload(150), small);
    const d = createDecoder({ hash: () => new Uint8Array(32) });
    let last;
    for (let i = 0; i < e.K; i++) last = await d.push(e.next());
    expect(last).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
  });

  it("reports HASH_MISMATCH when the record's byte length disagrees with the recovered length", async () => {
    const bytes = bytesOf(40, 5);
    const sha = await sha256WebCrypto(bytes);
    const record = serializeMetadata({ name: "x", mime: "", byteLength: 39, sha256: sha });
    const stream = new Uint8Array(record.length + 40);
    stream.set(record);
    stream.set(bytes, record.length);
    const d = createDecoder();
    const sess = new DataView((await sha256WebCrypto(record)).buffer).getUint32(0);
    const K = Math.ceil(stream.length / 16);
    let last;
    for (let i = 0; i < K; i++) {
      const block = new Uint8Array(16);
      block.set(stream.subarray(i * 16, Math.min(stream.length, (i + 1) * 16)));
      last = await d.push(encodePacket({ sessionId: sess, totalLength: stream.length, blockSize: 16, blockCount: K, seq: i, payload: block }));
    }
    expect(last).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
  });

  it("reports BAD_METADATA when the recovered stream does not start with a valid record", async () => {
    const stream = bytesOf(100, 3);
    stream[0] = 1; // version ok, then garbage lengths
    stream[1] = 0xff;
    stream[2] = 0xff;
    const d = createDecoder();
    const K = Math.ceil(stream.length / 16);
    let last;
    for (let i = 0; i < K; i++) {
      const block = new Uint8Array(16);
      block.set(stream.subarray(i * 16, Math.min(stream.length, (i + 1) * 16)));
      last = await d.push(encodePacket({ sessionId: 0x1234, totalLength: stream.length, blockSize: 16, blockCount: K, seq: i, payload: block }));
    }
    expect(last).toMatchObject({ kind: "rejected", code: "BAD_METADATA" });
    expect(() => d.result()).toThrow();
  });

  it("an injected hash that throws does not decide the outcome: the error surfaces and a later push retries", async () => {
    const e = await encode(payload(100), small);
    let fail = true;
    const hash = (data: Uint8Array) => {
      if (fail) throw new Error("boom");
      return sha256WebCrypto(data);
    };
    const d = createDecoder({ hash });
    for (let i = 0; i < e.K - 1; i++) await d.push(e.next());
    await expect(d.push(e.next())).rejects.toThrow("boom");
    fail = false;
    const s = await d.push(e.next()); // a further (repair) packet triggers the retry
    expect(s.progress.complete).toBe(true);
    expect(d.result().payload.length).toBe(100);
  });
});

describe("after completion (R5.17)", () => {
  it("valid packets, including foreign-session ones, are ignored with ALREADY_COMPLETE and change nothing", async () => {
    const e = await encode(payload(150), small);
    const other = await encode(payload(150, "other"), small);
    const d = createDecoderWith({}, DEFAULT_FORMAT);
    for (let i = 0; i < e.K; i++) await d.push(e.next());
    expect(d.progress().complete).toBe(true);
    const before = { p: d.progress(), dbg: d.debug() };
    expect(await d.push(e.next())).toMatchObject({ kind: "ignored", reason: "ALREADY_COMPLETE" });
    expect(await d.push(other.next())).toMatchObject({ kind: "ignored", reason: "ALREADY_COMPLETE" });
    expect(d.progress()).toEqual(before.p);
    expect(d.debug()).toEqual(before.dbg);
  });
  it("a corrupted packet is still rejected with its own code", async () => {
    const e = await encode(payload(60), small);
    const d = createDecoder();
    for (let i = 0; i < e.K; i++) await d.push(e.next());
    const bad = e.next();
    bad[40] = (bad[40] as number) ^ 1;
    expect(await d.push(bad)).toMatchObject({ kind: "rejected", code: "BAD_CRC" });
  });
});

describe("Gaussian elimination (R5.8, R5.9, R5.18)", () => {
  it("recovers dropped Blocks from dense rows, counting sparse plus dense rows in the trigger", async () => {
    const attempts: Array<{ rows: number; unsolved: number }> = [];
    const p = payload(600);
    const e = await encodeWith(p, small, { format: allDense });
    const K = e.K;
    const d = createDecoderWith({}, allDense, { onGauss: (i) => attempts.push(i) });
    const sys = Array.from({ length: K }, () => e.next());
    const dropped = [2, 7, 11, 19];
    for (let i = 0; i < K; i++) if (!dropped.includes(i)) await d.push(sys[i] as Uint8Array);
    expect(attempts.length).toBe(0); // no stored rows yet
    for (let i = 0; i < 40 && !d.progress().complete; i++) await d.push(e.next());
    expect(d.progress().complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
    expect(attempts.length).toBeGreaterThan(0);
    for (const a of attempts) expect(a.rows).toBeGreaterThanOrEqual(a.unsolved);
  });

  it("completes from systematic plus dense packets only (all repair packets dense)", async () => {
    const p = payload(900);
    const e = await encodeWith(p, small, { format: allDense });
    const K = e.K;
    const d = createDecoderWith({}, allDense);
    const sys = Array.from({ length: K }, () => e.next());
    for (let i = 0; i < K; i++) if (i % 3 !== 1) await d.push(sys[i] as Uint8Array);
    let n = 0;
    while (!d.progress().complete && n < 200) {
      await d.push(e.next());
      n++;
    }
    expect(d.result().payload).toEqual(p.bytes);
  });

  it("recovers from a pure dense stream with every systematic packet lost, retrying after rank deficiency", async () => {
    const attempts: Array<{ rows: number; unsolved: number }> = [];
    const p = payload(600);
    const e = await encodeWith(p, small, { format: allDense });
    const K = e.K;
    const d = createDecoderWith({}, allDense, { onGauss: (i) => attempts.push(i) });
    for (let i = 0; i < K; i++) e.next();
    let n = 0;
    while (!d.progress().complete && n < K + 40) {
      await d.push(e.next());
      n++;
    }
    expect(d.progress().complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
    expect(n).toBeGreaterThanOrEqual(K);
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts.length).toBeLessThan(15);
    for (const a of attempts) expect(a.rows).toBeGreaterThanOrEqual(a.unsolved);
  });

  it("maxGaussianBlocks = 0 never runs elimination: dense rows alone cannot finish, and nothing errors", async () => {
    let calls = 0;
    const e = await encodeWith(payload(600), small, { format: allDense });
    const K = e.K;
    const d = createDecoderWith({ maxGaussianBlocks: 0 }, allDense, { onGauss: () => calls++ });
    const sys = Array.from({ length: K }, () => e.next());
    for (let i = 0; i < K; i++) if (i !== 4) await d.push(sys[i] as Uint8Array);
    for (let i = 0; i < 60; i++) expect((await d.push(e.next())).kind).not.toBe("rejected");
    expect(calls).toBe(0);
    expect(d.progress().complete).toBe(false);
    expect(d.progress().solvedBlocks).toBe(K - 1);
  });

  it("the cap is a threshold on unsolved Blocks: U above it waits, U at it runs", async () => {
    const e = await encodeWith(payload(800), small, { format: allDense });
    const K = e.K;
    const run = async (cap: number) => {
      const calls: number[] = [];
      const d = createDecoderWith({ maxGaussianBlocks: cap }, allDense, { onGauss: (i) => calls.push(i.unsolved) });
      const f = await encodeWith(payload(800), small, { format: allDense });
      const sys = Array.from({ length: K }, () => f.next());
      for (let i = 0; i < K; i++) if (i >= 6) await d.push(sys[i] as Uint8Array); // U = 6
      for (let i = 0; i < 40 && !d.progress().complete; i++) await d.push(f.next());
      return { calls, complete: d.progress().complete };
    };
    const below = await run(5);
    expect(below.calls.length).toBe(0);
    expect(below.complete).toBe(false);
    const at = await run(6);
    expect(at.calls.length).toBeGreaterThan(0);
    expect(at.complete).toBe(true);
  });

  it("sparse equations and dense rows combine in one elimination", async () => {
    const p = payload(800);
    const mixed = { ...DEFAULT_FORMAT, D: 2 };
    const e = await encodeWith(p, small, { format: mixed });
    const K = e.K;
    const d = createDecoderWith({}, mixed);
    for (let i = 0; i < K; i++) e.next();
    let n = 0;
    while (!d.progress().complete && n < 8 * K) {
      await d.push(e.next());
      n++;
    }
    expect(d.result().payload).toEqual(p.bytes);
  });
});

describe("concurrency", () => {
  it("overlapping pushes finish with a single completion and the right bytes", async () => {
    const p = payload(700);
    const e = await encode(p, small);
    const d = createDecoder();
    const all = Array.from({ length: e.K }, () => e.next());
    const results = await Promise.all(all.map((x) => d.push(x)));
    expect(results.filter((r) => r.progress.complete).length).toBe(1);
    expect(results[results.length - 1]?.progress.complete).toBe(true);
    expect(d.result().payload).toEqual(p.bytes);
  });
  it("order does not matter (reverse order, systematic only)", async () => {
    const p = payload(500);
    const e = await encodeWith(p, small, { format: noDense });
    const d = createDecoderWith({}, noDense);
    const all = Array.from({ length: e.K }, () => e.next()).reverse();
    for (const x of all) await d.push(x);
    expect(d.result().payload).toEqual(p.bytes);
  });
  it("computeDigest and the packet helpers are consistent with the decoder's view", async () => {
    const e = await encode(payload(64), small);
    const first = e.next();
    expect(decodePacket(first).sessionId).toBe(e.sessionId);
    expect((await computeDigest(sha256WebCrypto, first)).length).toBe(32);
  });
});
