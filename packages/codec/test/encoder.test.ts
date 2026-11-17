import { describe, expect, it } from "vitest";
import { buildCodedStream, encode, encodeWith, type Encoder } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { sha256WebCrypto } from "../src/hash.js";
import { serializeMetadata } from "../src/metadata.js";
import { isDense, Neighbors, rowWords } from "../src/neighbors.js";
import { decodePacket } from "../src/packet.js";
import { R } from "../src/overhead.js";
import { getSolitonTable } from "../src/soliton.js";
import { codeOf } from "./helpers.js";

const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const payload = (n: number, name = "a", mime = "") => ({ bytes: bytesOf(n, n + 3), name, mime });
const small = { packetSize: 46 }; // blockSize 16

async function rejects(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}

/** Rebuild the coded stream from the K systematic packets. */
function blocksOf(e: Encoder): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < e.K; i++) out.push(decodePacket(e.next()).payload.slice());
  return out;
}
const naiveXor = (sets: Uint8Array[]): Uint8Array =>
  sets.reduce((acc, b) => Uint8Array.from(acc, (v, i) => v ^ (b[i] as number)), new Uint8Array(sets[0]?.length ?? 0));

describe("coded stream (R1.2)", () => {
  it("is the record followed directly by the payload bytes", () => {
    const rec = Uint8Array.from([1, 2, 3]);
    const pl = Uint8Array.from([9, 8]);
    expect([...buildCodedStream(rec, pl)]).toEqual([1, 2, 3, 9, 8]);
    expect([...buildCodedStream(rec, new Uint8Array(0))]).toEqual([1, 2, 3]);
  });
  it("the systematic packets carry record || payload, zero padded", async () => {
    const p = payload(100, "file.bin", "application/octet-stream");
    const e = await encode(p, small);
    const stream = new Uint8Array(e.K * e.blockSize);
    blocksOf(e).forEach((b, i) => stream.set(b, i * e.blockSize));
    const sha = await sha256WebCrypto(p.bytes);
    const record = serializeMetadata({ name: p.name, mime: p.mime, byteLength: 100, sha256: sha });
    expect(e.totalLength).toBe(record.length + 100);
    expect(stream.subarray(0, e.totalLength)).toEqual(buildCodedStream(record, p.bytes));
    expect([...stream.subarray(e.totalLength)].every((v) => v === 0)).toBe(true);
  });
});

describe("session id (R3.3)", () => {
  it("is the first 4 bytes of SHA-256 of the Metadata_Record", async () => {
    const p = payload(50, "x.txt", "text/plain");
    const e = await encode(p);
    const sha = await sha256WebCrypto(p.bytes);
    const record = serializeMetadata({ name: p.name, mime: p.mime, byteLength: 50, sha256: sha });
    const d = await sha256WebCrypto(record);
    expect(e.sessionId).toBe(new DataView(d.buffer).getUint32(0));
  });
  it("differs when only the name differs", async () => {
    const a = await encode({ ...payload(10), name: "a" });
    const b = await encode({ ...payload(10), name: "b" });
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});

describe("packetSize and limits (R3.4, R3.5, R7.3, R7.4)", () => {
  it("defaults to 2953-byte packets with a 2923-byte block", async () => {
    const e = await encode(payload(10000));
    expect(e.packetSize).toBe(2953);
    expect(e.blockSize).toBe(2923);
    expect(e.next().length).toBe(2953);
    expect(e.K).toBe(Math.ceil(e.totalLength / 2923));
  });
  it("accepts packetSize 46 and 65565, rejects 45 and 65566", async () => {
    expect((await encode(payload(5), { packetSize: 46 })).blockSize).toBe(16);
    expect((await encode(payload(5), { packetSize: 65565 })).blockSize).toBe(65535);
    expect(await rejects(encode(payload(5), { packetSize: 45 }))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(5), { packetSize: 65566 }))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(5), { packetSize: 100.5 }))).toBe("INVALID_INPUT");
  });
  it("payload length equal to maxPayloadBytes is accepted, one more is PAYLOAD_TOO_LARGE", async () => {
    expect((await encode(payload(64), { maxPayloadBytes: 64 })).K).toBeGreaterThan(0);
    expect(await rejects(encode(payload(65), { maxPayloadBytes: 64 }))).toBe("PAYLOAD_TOO_LARGE");
  });
  it("K equal to maxBlockCount is accepted, one more is TOO_MANY_BLOCKS", async () => {
    // record for name "a", empty mime is 41 bytes; blockSize 16: L = 41 + n
    expect((await encode(payload(39), { ...small, maxBlockCount: 5 })).K).toBe(5);
    expect(await rejects(encode(payload(40), { ...small, maxBlockCount: 5 }))).toBe("TOO_MANY_BLOCKS");
  });
  it("accepts an empty payload", async () => {
    const e = await encode({ bytes: new Uint8Array(0), name: "empty", mime: "" }, small);
    expect(e.K).toBeGreaterThanOrEqual(1);
    expect(decodePacket(e.next()).totalLength).toBe(e.totalLength);
  });
  it("K = 1 works", async () => {
    const e = await encode(payload(1), { packetSize: 2953 });
    expect(e.K).toBe(1);
    expect(decodePacket(e.next()).seq).toBe(0);
    expect(decodePacket(e.next()).seq).toBe(1);
  });
});

describe("next() (R4.1, R4.2, R4.8)", () => {
  it("is synchronous and goes 0..K-1 then K, K+1, ...", async () => {
    const e = await encode(payload(200), small);
    const r = e.next();
    expect(r).toBeInstanceOf(Uint8Array);
    expect(r instanceof Promise).toBe(false);
    const seqs = [decodePacket(r).seq];
    for (let i = 1; i < e.K + 5; i++) seqs.push(decodePacket(e.next()).seq);
    expect(seqs).toEqual(Array.from({ length: e.K + 5 }, (_, i) => i));
  });
  it("wraps from 2^32 - 1 to K", async () => {
    const e = await encodeWith(payload(200), small, { startSeq: 0xfffffffe });
    const seqs = [0, 1, 2, 3].map(() => decodePacket(e.next()).seq);
    expect(seqs).toEqual([0xfffffffe, 0xffffffff, e.K, e.K + 1]);
  });
  it("two encoders give identical bytes for the first 3K packets (R6.1 example)", async () => {
    const a = await encode(payload(300, "same"), small);
    const b = await encode(payload(300, "same"), small);
    for (let i = 0; i < 3 * a.K; i++) expect(a.next()).toEqual(b.next());
  });
  it("returns fresh buffers (callers may keep them)", async () => {
    const e = await encode(payload(60), small);
    const x = e.next();
    const y = e.next();
    expect(x.buffer).not.toBe(y.buffer);
  });
});

describe("page() (R4.3, R4.4, R4.5, R4.6)", () => {
  it("returns K + R(K) packets by default, systematic first then repair, ascending seq", async () => {
    const e = await encode(payload(500), small);
    const page = e.page();
    expect(page.length).toBe(e.K + R(e.K));
    expect(page.map((p) => decodePacket(p).seq)).toEqual(page.map((_, i) => i));
  });
  it("uses a configured repairCount, including 0", async () => {
    const e0 = await encode(payload(500), { ...small, repairCount: 0 });
    expect(e0.page().length).toBe(e0.K);
    const e3 = await encode(payload(500), { ...small, repairCount: 3 });
    expect(e3.page().length).toBe(e3.K + 3);
  });
  it("rejects an invalid repairCount without producing an encoder", async () => {
    expect(await rejects(encode(payload(50), { ...small, repairCount: -1 }))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(50), { ...small, repairCount: 1.5 }))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(50), { ...small, repairCount: 4294967295 }))).toBe("INVALID_INPUT");
  });
  it("is synchronous, repeatable and independent of next()", async () => {
    const e = await encode(payload(120), small);
    const first = e.page().map((p) => p.slice());
    e.next();
    e.next();
    const second = e.page();
    expect(second.length).toBe(first.length);
    second.forEach((p, i) => expect(p).toEqual(first[i]));
    expect(e.page() instanceof Promise).toBe(false);
  });
  it("matches next() packet for packet", async () => {
    const e = await encode(payload(120), small);
    const page = e.page();
    const f = await encode(payload(120), small);
    for (const p of page) expect(p).toEqual(f.next());
  });
});

describe("dense emission (R2.2, R2.10, R2.13, R6.7)", () => {
  for (const D of [0, 3, 4, 8]) {
    it(`each packet's payload follows the index rule for D = ${D}, including after the seq wrap`, async () => {
      const p = payload(400, "d", "");
      const e = await encodeWith(p, small, { format: { ...DEFAULT_FORMAT, D }, startSeq: 0xfffffffd });
      const K = e.K;
      const probe = await encodeWith(p, small, { format: { ...DEFAULT_FORMAT, D } });
      const blocks = blocksOf(probe);
      const table = getSolitonTable(K, DEFAULT_FORMAT);
      const sparseOnly = new Neighbors(K, table, 0);
      const denseGen = new Neighbors(K, table, 1); // D = 1: every repair packet dense, used for expected dense sets
      const row = new Uint32Array(rowWords(K));
      const set = new Uint32Array(K);
      const seen: number[] = [];
      for (let i = 0; i < 3 + 60; i++) {
        const pk = decodePacket(e.next());
        seen.push(pk.seq);
        let want: Uint8Array;
        if (pk.seq < K) {
          want = blocks[pk.seq] as Uint8Array;
        } else if (isDense(pk.seq, K, D)) {
          const cnt = denseGen.denseRow(e.sessionId, pk.seq, row);
          const picked: Uint8Array[] = [];
          for (let b = 0; b < K; b++) if (((row[b >>> 5] as number) >>> (b & 31)) & 1) picked.push(blocks[b] as Uint8Array);
          expect(picked.length).toBe(cnt);
          want = naiveXor(picked);
        } else {
          const n = sparseOnly.select(e.sessionId, pk.seq, set);
          want = naiveXor(Array.from(set.subarray(0, n), (b) => blocks[b] as Uint8Array));
        }
        expect(pk.payload, `D=${D} seq=${pk.seq}`).toEqual(want);
      }
      // 0xfffffffd, 0xfffffffe, 0xffffffff, then K, K+1, ...
      expect(seen.slice(0, 5)).toEqual([0xfffffffd, 0xfffffffe, 0xffffffff, K, K + 1]);
      const dense = seen.filter((s) => s >= K && isDense(s, K, D)).length;
      if (D === 0) expect(dense).toBe(0);
      else expect(dense).toBeGreaterThan(0);
    });
  }
  it("two encoders give byte-identical dense packets", async () => {
    const p = payload(400, "dd");
    const fmt = { ...DEFAULT_FORMAT, D: 4 };
    const a = await encodeWith(p, small, { format: fmt });
    const b = await encodeWith(p, small, { format: fmt });
    for (let i = 0; i < 4 * a.K; i++) expect(a.next()).toEqual(b.next());
  });
  it("D = 4 makes seq K+3 dense and K+0..K+2 sparse (kind by index only)", async () => {
    const p = payload(400);
    const dflt = await encodeWith(p, small, { format: { ...DEFAULT_FORMAT, D: 4 } });
    const none = await encodeWith(p, small, { format: { ...DEFAULT_FORMAT, D: 0 } });
    const K = dflt.K;
    const a = dflt.page();
    const b = none.page();
    for (const j of [0, 1, 2, 4, 5, 6]) expect(a[K + j]).toEqual(b[K + j]);
    expect(a[K + 3]).not.toEqual(b[K + 3]);
  });
});

describe("validation and injection (R9.2)", () => {
  it("rejects bad payload shapes and options with INVALID_INPUT", async () => {
    expect(await rejects(encode(null as never))).toBe("INVALID_INPUT");
    expect(await rejects(encode({ bytes: [1, 2], name: "a", mime: "" } as never))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(5), "opts" as never))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(5), { hash: 5 } as never))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(5), { maxPayloadBytes: 0 }))).toBe("INVALID_INPUT");
    expect(await rejects(encode(payload(5), { maxBlockCount: 0 }))).toBe("INVALID_INPUT");
  });
  it("reports name problems as BAD_METADATA", async () => {
    expect(await rejects(encode({ ...payload(5), name: "a/b" }))).toBe("BAD_METADATA");
    expect(await rejects(encode({ ...payload(5), name: "" }))).toBe("BAD_METADATA");
  });
  it("uses an injected hash twice (payload, then record) and awaits async hashes", async () => {
    const calls: number[] = [];
    const hash = async (d: Uint8Array) => {
      calls.push(d.length);
      return new Uint8Array(32).fill(7);
    };
    const e = await encode(payload(20), { hash });
    expect(calls.length).toBe(2);
    expect(calls[0]).toBe(20);
    expect(e.sessionId).toBe(0x07070707);
    const sync = await encode(payload(20), { hash: () => new Uint8Array(32).fill(7) });
    expect(sync.sessionId).toBe(0x07070707);
  });
  it("a hash that returns the wrong size is INVALID_INPUT", async () => {
    expect(await rejects(encode(payload(5), { hash: () => new Uint8Array(5) }))).toBe("INVALID_INPUT");
  });
  it("codeOf helper sanity", () => {
    expect(codeOf(() => undefined)).toBeUndefined();
  });
});
