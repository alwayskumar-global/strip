import { describe, expect, it } from "vitest";
import { computeDigest, sha256WebCrypto, type HashFn } from "../src/hash.js";
import { codeOf } from "./helpers.js";

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("sha256WebCrypto (R1.10)", () => {
  it("returns a 32-byte digest", async () => {
    const d = await sha256WebCrypto(ascii("x"));
    expect(d).toBeInstanceOf(Uint8Array);
    expect(d.length).toBe(32);
  });
  it("matches known SHA-256 vectors, including empty input", async () => {
    expect(hex(await sha256WebCrypto(new Uint8Array(0)))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(hex(await sha256WebCrypto(ascii("abc")))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hex(await sha256WebCrypto(ascii("The quick brown fox jumps over the lazy dog")))).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });
  it("hashes a subarray view by its own bytes", async () => {
    const host = ascii("zzabcyy");
    expect(hex(await sha256WebCrypto(host.subarray(2, 5)))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("computeDigest (R1.9)", () => {
  it("accepts a sync HashFn and an async HashFn", async () => {
    const sync: HashFn = () => new Uint8Array(32).fill(1);
    const asyn: HashFn = () => Promise.resolve(new Uint8Array(32).fill(2));
    expect([...(await computeDigest(sync, new Uint8Array(1)))]).toEqual(new Array(32).fill(1));
    expect([...(await computeDigest(asyn, new Uint8Array(1)))]).toEqual(new Array(32).fill(2));
  });
  it("returns a private copy", async () => {
    const shared = new Uint8Array(32).fill(5);
    const d = await computeDigest(() => shared, new Uint8Array(0));
    shared[0] = 9;
    expect(d[0]).toBe(5);
  });
  it("rejects a digest that is not 32 bytes, or a non-function", async () => {
    await expect(computeDigest(() => new Uint8Array(31), new Uint8Array(0))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(computeDigest((() => [1, 2, 3]) as unknown as HashFn, new Uint8Array(0))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(computeDigest("nope" as unknown as HashFn, new Uint8Array(0))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(codeOf(() => 0)).toBeUndefined();
  });
});
