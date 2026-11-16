// IEEE 802.3 CRC-32: reflected polynomial 0xEDB88320, init and final xor 0xFFFFFFFF.
const TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
  }
  TABLE[n] = c;
}

/** CRC-32 of bytes[start, end), returned as an unsigned 32-bit integer. */
export function crc32(bytes: Uint8Array, start = 0, end: number = bytes.length): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) {
    c = (TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
