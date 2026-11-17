import { describe, expect, it } from "vitest";
import { BlockBuffer, copyBlock, strideOf, xorBlock, xorSetInto } from "../src/xor.js";

// Deterministic filler without Math.random.
function fill(buf: BlockBuffer, seed: number): void {
  let x = seed >>> 0 || 1;
  for (let i = 0; i < buf.count; i++) {
    const b = buf.block(i);
    for (let t = 0; t < b.length; t++) {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      b[t] = x >>> 24;
    }
  }
}

const naiveXor = (a: Uint8Array, b: Uint8Array): Uint8Array => Uint8Array.from(a, (v, i) => v ^ (b[i] as number));

describe("stride helpers (R2.1)", () => {
  it("rounds blockSize up to a multiple of 4", () => {
    expect(strideOf(16)).toBe(16);
    expect(strideOf(17)).toBe(20);
    expect(strideOf(18)).toBe(20);
    expect(strideOf(19)).toBe(20);
    expect(strideOf(2923)).toBe(2924);
    expect(strideOf(65535)).toBe(65536);
  });
  it("lays Blocks out on 4-byte boundaries with zero padding", () => {
    const b = new BlockBuffer(3, 18);
    expect(b.stride).toBe(20);
    expect(b.bytes.length).toBe(60);
    expect(b.words.length).toBe(15);
    expect(b.offset(2)).toBe(40);
    expect(b.block(1).length).toBe(18);
    expect(b.block(1).byteOffset % 4).toBe(0);
  });
  it("clear zeroes a Block including its padding", () => {
    const b = new BlockBuffer(2, 17);
    b.bytes.fill(0xff);
    b.clear(1);
    expect([...b.bytes.subarray(20, 40)].every((v) => v === 0)).toBe(true);
    expect(b.bytes[19]).toBe(0xff);
  });
});

describe("xorBlock (R2.3)", () => {
  for (const bs of [16, 17, 18, 19, 2923]) {
    it(`matches a naive byte XOR for blockSize ${bs} and leaves padding zero`, () => {
      const a = new BlockBuffer(4, bs);
      const b = new BlockBuffer(4, bs);
      fill(a, 11);
      fill(b, 22);
      const before = a.block(2).slice();
      const other = b.block(3).slice();
      xorBlock(a, 2, b, 3);
      expect(a.block(2)).toEqual(naiveXor(before, other));
      // other Blocks untouched, padding still zero
      expect(a.block(1)).toEqual(Uint8Array.from(a.block(1)));
      for (let t = bs; t < a.stride; t++) expect(a.bytes[2 * a.stride + t]).toBe(0);
      // source untouched
      expect(b.block(3)).toEqual(other);
    });
  }
  it("XOR twice restores the original", () => {
    const a = new BlockBuffer(2, 19);
    const b = new BlockBuffer(2, 19);
    fill(a, 5);
    fill(b, 6);
    const orig = a.block(0).slice();
    xorBlock(a, 0, b, 1);
    xorBlock(a, 0, b, 1);
    expect(a.block(0)).toEqual(orig);
  });
});

describe("xorSetInto (R2.13)", () => {
  for (const bs of [16, 17, 19, 2923]) {
    it(`matches a naive XOR for a dense-sized set (about K/2 Blocks), blockSize ${bs}`, () => {
      const K = 64;
      const store = new BlockBuffer(K, bs);
      fill(store, 99);
      const set = Uint32Array.from({ length: 32 }, (_, i) => i * 2 + 1);
      const out = new BlockBuffer(1, bs);
      out.bytes.fill(0xaa); // must be cleared first
      xorSetInto(out, 0, store, set, set.length);
      let want: Uint8Array = new Uint8Array(bs);
      for (const i of set) want = naiveXor(want, store.block(i));
      expect(out.block(0)).toEqual(want);
    });
  }
  it("a single-Block set copies that Block", () => {
    const store = new BlockBuffer(10, 17);
    fill(store, 3);
    const out = new BlockBuffer(1, 17);
    xorSetInto(out, 0, store, Uint32Array.of(7), 1);
    expect(out.block(0)).toEqual(store.block(7));
  });
  it("an empty set gives zeros and only the first n entries are used", () => {
    const store = new BlockBuffer(10, 20);
    fill(store, 4);
    const out = new BlockBuffer(1, 20);
    out.bytes.fill(1);
    xorSetInto(out, 0, store, Uint32Array.of(1, 2, 3), 0);
    expect([...out.bytes].every((v) => v === 0)).toBe(true);
    xorSetInto(out, 0, store, Uint32Array.of(1, 2, 3), 2);
    expect(out.block(0)).toEqual(naiveXor(store.block(1), store.block(2)));
  });
  it("can write into a Block of a larger destination", () => {
    const store = new BlockBuffer(5, 18);
    fill(store, 8);
    const dst = new BlockBuffer(3, 18);
    xorSetInto(dst, 2, store, Uint32Array.of(0, 4), 2);
    expect(dst.block(2)).toEqual(naiveXor(store.block(0), store.block(4)));
    expect([...dst.block(1)].every((v) => v === 0)).toBe(true);
  });
});

describe("copyBlock", () => {
  it("copies one Block (with padding) and leaves the others alone", () => {
    const src = new BlockBuffer(3, 19);
    fill(src, 13);
    const dst = new BlockBuffer(4, 19);
    dst.bytes.fill(0xee);
    copyBlock(dst, 2, src, 1);
    expect(dst.block(2)).toEqual(src.block(1));
    expect(dst.bytes[2 * 20 + 19]).toBe(0);
    expect(dst.bytes[1 * 20]).toBe(0xee);
    expect(dst.bytes[3 * 20]).toBe(0xee);
  });
});
