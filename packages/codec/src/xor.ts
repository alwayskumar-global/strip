// Block storage with a 4-byte-aligned stride, and XOR helpers over Uint32Array views plus a byte tail.
// XOR is bytewise, so results do not depend on platform endianness.

/** Bytes per stored Block: blockSize rounded up to a multiple of 4. */
export function strideOf(blockSize: number): number {
  return (blockSize + 3) & ~3;
}

/** `count` Blocks of `blockSize` wire bytes, each starting on a 4-byte boundary (stride padded with zeros). */
export class BlockBuffer {
  readonly count: number;
  readonly blockSize: number;
  readonly stride: number;
  readonly bytes: Uint8Array;
  readonly words: Uint32Array;

  constructor(count: number, blockSize: number) {
    this.count = count;
    this.blockSize = blockSize;
    this.stride = strideOf(blockSize);
    const buf = new ArrayBuffer(count * this.stride);
    this.bytes = new Uint8Array(buf);
    this.words = new Uint32Array(buf);
  }

  /** Byte offset of Block i. */
  offset(i: number): number {
    return i * this.stride;
  }

  /** View of the blockSize wire bytes of Block i. */
  block(i: number): Uint8Array {
    const o = i * this.stride;
    return this.bytes.subarray(o, o + this.blockSize);
  }

  /** Zero Block i, including its padding. */
  clear(i: number): void {
    const w = (i * this.stride) >>> 2;
    this.words.fill(0, w, w + (this.stride >>> 2));
  }
}

/**
 * dst[block di] ^= src[block si] over blockSize bytes: floor(blockSize / 4) words, then the byte tail.
 * Both stores must use the same blockSize. No allocation.
 */
export function xorBlock(dst: BlockBuffer, di: number, src: BlockBuffer, si: number): void {
  const bs = dst.blockSize;
  const nw = bs >>> 2;
  const dw = (di * dst.stride) >>> 2;
  const sw = (si * src.stride) >>> 2;
  const d32 = dst.words;
  const s32 = src.words;
  for (let i = 0; i < nw; i++) d32[dw + i] = (d32[dw + i] as number) ^ (s32[sw + i] as number);
  const tail = bs & 3;
  if (tail !== 0) {
    const d8 = dst.bytes;
    const s8 = src.bytes;
    const base = nw << 2;
    const dOff = di * dst.stride + base;
    const sOff = si * src.stride + base;
    for (let t = 0; t < tail; t++) d8[dOff + t] = (d8[dOff + t] as number) ^ (s8[sOff + t] as number);
  }
}

/**
 * Set Block `di` of `dst` to the XOR of the Blocks of `src` listed in set[0..n).
 * Used for sparse payloads (few Blocks) and dense payloads (about K/2 Blocks) alike.
 */
export function xorSetInto(dst: BlockBuffer, di: number, src: BlockBuffer, set: Uint32Array, n: number): void {
  dst.clear(di);
  for (let i = 0; i < n; i++) xorBlock(dst, di, src, set[i] as number);
}

/** dst[block di] = src[block si], including padding. Both stores must use the same blockSize. */
export function copyBlock(dst: BlockBuffer, di: number, src: BlockBuffer, si: number): void {
  const nw = dst.stride >>> 2;
  const sw = (si * src.stride) >>> 2;
  dst.words.set(src.words.subarray(sw, sw + nw), (di * dst.stride) >>> 2);
}
