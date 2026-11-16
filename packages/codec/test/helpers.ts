import { crc32 } from "../src/crc32.js";

export interface RawSpec {
  magic?: number;
  version?: number;
  flags?: number;
  sessionId?: number;
  totalLength?: number;
  blockSize?: number;
  blockCount?: number;
  seq?: number;
  payload?: Uint8Array;
  /** Extra bytes appended or removed from the payload section. */
  lengthDelta?: number;
  badHeaderCrc?: boolean;
  badTrailingCrc?: boolean;
}

/** Hand-built packet bytes, independent of src/header.ts, with CRCs recomputed unless told otherwise. */
export function rawPacket(spec: RawSpec = {}): Uint8Array {
  const blockSize = spec.blockSize ?? 16;
  const totalLength = spec.totalLength ?? blockSize * 2;
  const payload = spec.payload ?? Uint8Array.from({ length: blockSize }, (_, i) => (i * 7 + 3) & 0xff);
  const delta = spec.lengthDelta ?? 0;
  const payloadLen = Math.max(0, payload.length + delta);
  const out = new Uint8Array(26 + payloadLen + 4);
  const v = new DataView(out.buffer);
  v.setUint16(0, spec.magic ?? 0x5354);
  v.setUint8(2, spec.version ?? 1);
  v.setUint8(3, spec.flags ?? 0);
  v.setUint32(4, spec.sessionId ?? 0xa1b2c3d4);
  v.setUint32(8, totalLength);
  v.setUint16(12, blockSize);
  v.setUint32(14, spec.blockCount ?? Math.ceil(totalLength / blockSize));
  v.setUint32(18, spec.seq ?? 5);
  const hc = crc32(out, 0, 22);
  v.setUint32(22, spec.badHeaderCrc ? (hc ^ 1) >>> 0 : hc);
  out.set(payload.subarray(0, Math.min(payload.length, payloadLen)), 26);
  const tc = crc32(out, 0, 26 + payloadLen);
  v.setUint32(26 + payloadLen, spec.badTrailingCrc ? (tc ^ 1) >>> 0 : tc);
  return out;
}

export function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? `non-CodecError: ${String(e)}`;
  }
  return undefined;
}
