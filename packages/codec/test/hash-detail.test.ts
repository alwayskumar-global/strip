import { describe, expect, it } from "vitest";
import { createDecoder } from "../src/decoder.js";
import { encode, type PayloadInput } from "../src/encoder.js";
import { sha256WebCrypto } from "../src/hash.js";
import { serializeMetadata } from "../src/metadata.js";
import { encodePacket } from "../src/packet.js";
const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const payload = (n: number): PayloadInput => ({ bytes: bytesOf(n, n + 9), name: "p.bin", mime: "application/x-test" });
const small = { packetSize: 46 };
const prefix = (d: Uint8Array): string => Array.from(d.subarray(0, 6), (b) => b.toString(16).padStart(2, "0")).join("");
async function feed(d: ReturnType<typeof createDecoder>, e: { K: number; next(): Uint8Array }) {
  let last;
  for (let i = 0; i < e.K; i++) last = await d.push(e.next());
  return last;
}
describe("HASH_MISMATCH digest prefixes (R5.24 to R5.29)", () => {
  it("R5.24: an encoder-side wrong digest: expected is the stored digest prefix, actual the payload's", async () => {
    const p = payload(150);
    const e = await encode(p, { ...small, hash: () => new Uint8Array(32).fill(7) });
    const last = await feed(createDecoder(), e);
    expect(last).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
    const real = prefix(await sha256WebCrypto(p.bytes));
    expect((last as { hashes?: unknown }).hashes).toEqual({ expected: "070707070707", actual: real });
  });
  it("R5.24: a decoder-side wrong digest: expected is the stored prefix, actual the injected digest's", async () => {
    const p = payload(150);
    const e = await encode(p, small);
    const last = await feed(createDecoder({ hash: () => new Uint8Array(32) }), e);
    expect((last as { hashes?: unknown }).hashes).toEqual({ expected: prefix(await sha256WebCrypto(p.bytes)), actual: "000000000000" });
  });
  it("R5.25: the length-mismatch path still carries both prefixes", async () => {
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
    // The reassembled payload is the same 40 bytes, so the prefixes agree: only the length disagrees with the record.
    expect((last as { hashes?: unknown }).hashes).toEqual({ expected: prefix(sha), actual: prefix(sha) });
  });
  it("R5.26: later pushes to the terminal decoder return the same rejection including the same hashes", async () => {
    const e = await encode(payload(150), { ...small, hash: () => new Uint8Array(32).fill(9) });
    const d = createDecoder();
    const first = await feed(d, e);
    const again = await d.push(e.next());
    const third = await d.push(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46]));
    for (const s of [again, third]) {
      expect(s).toMatchObject({ kind: "rejected", code: "HASH_MISMATCH" });
      expect((s as { hashes?: unknown }).hashes).toEqual((first as { hashes?: unknown }).hashes);
    }
  });
  it("R5.27: hashes is absent from accepted, ignored and every other rejected status", async () => {
    const e = await encode(payload(400), small);
    const d = createDecoder();
    const p0 = e.next();
    const s1 = await d.push(p0);
    const s2 = await d.push(p0); // duplicate
    const bad = p0.slice();
    bad[bad.length - 1] = (bad[bad.length - 1] as number) ^ 1;
    const s3 = await d.push(bad); // BAD_CRC
    expect(s1.kind).toBe("accepted");
    expect(s2).toMatchObject({ kind: "ignored", reason: "DUPLICATE_PACKET" });
    expect(s3).toMatchObject({ kind: "rejected", code: "BAD_CRC" });
    for (const s of [s1, s2, s3]) expect("hashes" in s).toBe(false);
    const ok = await feed(createDecoder(), await encode(payload(150), small));
    expect(ok).toMatchObject({ kind: "accepted" });
    expect("hashes" in (ok as object)).toBe(false);
  });
  it("R5.28: a hash function that throws surfaces the error and leaves the decoder collecting, on the length-mismatch path too", async () => {
    const e = await encode(payload(150), small);
    const d = createDecoder({ hash: () => { throw new Error("no digest"); } });
    for (let i = 0; i < e.K - 1; i++) await d.push(e.next());
    await expect(d.push(e.next())).rejects.toThrow("no digest");
    expect(d.progress().complete).toBe(false);
  });
  it("R5.29: only 12-hex prefixes are exposed, never a full digest", async () => {
    const e = await encode(payload(150), { ...small, hash: () => new Uint8Array(32).fill(7) });
    const s = await feed(createDecoder(), e);
    const h = (s as { hashes: { expected: string; actual: string } }).hashes;
    expect(Object.keys(h).sort()).toEqual(["actual", "expected"]);
    expect(h.expected).toMatch(/^[0-9a-f]{12}$/);
    expect(h.actual).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(s)).not.toMatch(/[0-9a-f]{64}/);
  });
});
