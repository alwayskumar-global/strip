import { describe, expect, it } from "vitest";
import { createDecoder, createDecoderWith } from "../src/decoder.js";
import { encode, encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { rawPacket } from "./helpers.js";

const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const payload = (n: number, name = "a") => ({ bytes: bytesOf(n, n + 7), name, mime: "" });
const small = { packetSize: 46 }; // blockSize 16
const noDense = { ...DEFAULT_FORMAT, D: 0 };

describe("session handling (R5.2, R5.4, R5.5)", () => {
  it("fixes session and parameters from the first valid packet", async () => {
    const e = await encode(payload(200), small);
    const d = createDecoderWith({}, noDense);
    expect(d.progress()).toEqual({ solvedBlocks: 0, totalBlocks: 0, distinctPackets: 0, complete: false });
    const s = await d.push(e.next());
    expect(s.kind).toBe("accepted");
    expect(d.progress()).toEqual({ solvedBlocks: 1, totalBlocks: e.K, distinctPackets: 1, complete: false });
  });

  it("ignores a packet from another session with SESSION_MISMATCH and leaves state unchanged", async () => {
    const a = await encode(payload(200, "a"), small);
    const b = await encode(payload(200, "b"), small);
    const d = createDecoderWith({}, noDense);
    await d.push(a.next());
    const before = { p: d.progress(), dbg: d.debug() };
    const s = await d.push(b.next());
    expect(s).toMatchObject({ kind: "ignored", reason: "SESSION_MISMATCH" });
    expect(d.progress()).toEqual(before.p);
    expect(d.debug()).toEqual(before.dbg);
  });

  it("rejects same-session packets with inconsistent parameters as BAD_HEADER, state unchanged", async () => {
    const e = await encode(payload(200), small);
    const d = createDecoderWith({}, noDense);
    await d.push(e.next());
    const before = { p: d.progress(), dbg: d.debug() };
    const forged = rawPacket({ sessionId: e.sessionId, blockSize: 16, totalLength: e.totalLength + 16, blockCount: e.K + 1, seq: 5 });
    expect(await d.push(forged)).toMatchObject({ kind: "rejected", code: "BAD_HEADER" });
    const forged2 = rawPacket({ sessionId: e.sessionId, blockSize: 17, totalLength: e.totalLength, blockCount: Math.ceil(e.totalLength / 17), seq: 5, payload: new Uint8Array(17) });
    expect(await d.push(forged2)).toMatchObject({ kind: "rejected", code: "BAD_HEADER" });
    expect(d.progress()).toEqual(before.p);
    expect(d.debug()).toEqual(before.dbg);
  });
});

describe("duplicates (R5.3)", () => {
  it("ignores a repeated packet with DUPLICATE_PACKET and changes nothing", async () => {
    const e = await encode(payload(200), small);
    const d = createDecoderWith({}, noDense);
    const p = e.next();
    await d.push(p);
    await d.push(e.next());
    const before = { p: d.progress(), dbg: d.debug() };
    expect(await d.push(p)).toMatchObject({ kind: "ignored", reason: "DUPLICATE_PACKET" });
    expect(d.progress()).toEqual(before.p);
    expect(d.debug()).toEqual(before.dbg);
    expect(d.progress().distinctPackets).toBe(2);
  });

  it("counts each distinct sequence number once, for systematic and repair packets", async () => {
    const e = await encodeWith(payload(300), small, { format: noDense });
    const d = createDecoderWith({}, noDense);
    const packets = Array.from({ length: e.K + 10 }, () => e.next());
    for (const p of packets) await d.push(p);
    for (const p of packets) await d.push(p);
    expect(d.progress().distinctPackets).toBe(e.K + 10);
  });
});

describe("rejection leaves state unchanged (R7.7)", () => {
  it("reports bad packets in the status, never throws, and changes nothing", async () => {
    const e = await encode(payload(200), small);
    const d = createDecoderWith({}, noDense);
    await d.push(e.next());
    const before = { p: d.progress(), dbg: d.debug() };
    const good = e.next();
    const flipped = good.slice();
    flipped[30] = (flipped[30] as number) ^ 1;
    expect(await d.push(flipped)).toMatchObject({ kind: "rejected", code: "BAD_CRC" });
    expect(await d.push(good.subarray(0, 20))).toMatchObject({ kind: "rejected", code: "BAD_HEADER" });
    expect(await d.push(new Uint8Array(0))).toMatchObject({ kind: "rejected", code: "BAD_HEADER" });
    expect(await d.push(rawPacket({ version: 3 }))).toMatchObject({ kind: "rejected", code: "UNSUPPORTED_VERSION" });
    expect(d.progress()).toEqual(before.p);
    expect(d.debug()).toEqual(before.dbg);
  });

  it("a rejected first packet does not start a session", async () => {
    const d = createDecoderWith({}, noDense);
    await d.push(rawPacket({ badHeaderCrc: true }));
    expect(d.progress().totalBlocks).toBe(0);
    expect(d.debug().phase).toBe("idle");
  });

  it("applies the decoder limits (maxPayloadBytes, maxBlockCount) to incoming packets", async () => {
    const e = await encode(payload(400), small);
    const tight = createDecoderWith({ maxBlockCount: 2 }, noDense);
    expect(await tight.push(e.next())).toMatchObject({ kind: "rejected", code: "TOO_MANY_BLOCKS" });
    const small2 = createDecoderWith({ maxPayloadBytes: 50 }, noDense);
    expect(await small2.push(e.next())).toMatchObject({ kind: "rejected", code: "PAYLOAD_TOO_LARGE" });
  });

  it("rejects a non-Uint8Array argument with INVALID_INPUT (a promise rejection, not a status)", async () => {
    const d = createDecoder();
    await expect(d.push([1, 2, 3] as unknown as Uint8Array)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(d.push("x" as unknown as Uint8Array)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("rejects invalid options at creation", () => {
    expect(() => createDecoder({ maxGaussianBlocks: -1 })).toThrow();
    expect(() => createDecoder({ maxBlockCount: 0 })).toThrow();
    expect(() => createDecoder({ hash: 5 as never })).toThrow();
  });
});

describe("progress fields (R5.6)", () => {
  it("expose solvedBlocks, totalBlocks, distinctPackets and complete", async () => {
    const e = await encodeWith(payload(100), small, { format: noDense });
    const d = createDecoderWith({}, noDense);
    for (let i = 0; i < 3; i++) await d.push(e.next());
    const p = d.progress();
    expect(Object.keys(p).sort()).toEqual(["complete", "distinctPackets", "solvedBlocks", "totalBlocks"]);
    expect(p.solvedBlocks).toBe(3);
    expect(p.totalBlocks).toBe(e.K);
    expect(p.distinctPackets).toBe(3);
    expect(p.complete).toBe(false);
  });
  it("a status carries the post-push progress", async () => {
    const e = await encode(payload(100), small);
    const d = createDecoderWith({}, noDense);
    const s = await d.push(e.next());
    expect(s.progress).toEqual(d.progress());
  });
});

describe("sparse equation memory bound (2K + 64)", () => {
  it("never stores more than 2K + 64 equations, but still counts packets as distinct", async () => {
    const e = await encodeWith(payload(2000), small, { format: noDense });
    const K = e.K;
    const d = createDecoderWith({}, noDense);
    for (let i = 0; i < K; i++) e.next(); // skip systematic packets
    const N = 4 * K;
    for (let i = 0; i < N; i++) await d.push(e.next());
    const dbg = d.debug();
    expect(dbg.equationCapacity).toBe(2 * K + 64);
    expect(dbg.liveEquations).toBeLessThanOrEqual(2 * K + 64);
    expect(d.progress().distinctPackets).toBe(N);
  });
});

describe("serialized pushes", () => {
  it("overlapping push calls are processed in call order", async () => {
    const e = await encodeWith(payload(120), small, { format: noDense });
    const d = createDecoderWith({}, noDense);
    const ps = Array.from({ length: e.K }, () => d.push(e.next()));
    const results = await Promise.all(ps);
    results.forEach((r, i) => expect(r.progress.distinctPackets).toBe(i + 1));
  });
});
