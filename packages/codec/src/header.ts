import { FORMAT_VERSION, HEADER_CRC_COVERAGE, MAGIC } from "./constants.js";
import { crc32 } from "./crc32.js";

/** Byte offsets of the 26-byte big-endian packet header. */
export const OFFSETS = {
  magic: 0,
  version: 2,
  flags: 3,
  sessionId: 4,
  totalLength: 8,
  blockSize: 12,
  blockCount: 14,
  seq: 18,
  headerCrc: 22,
  payload: 26,
} as const;

export interface HeaderFields {
  readonly sessionId: number;
  readonly totalLength: number;
  readonly blockSize: number;
  readonly blockCount: number;
  readonly seq: number;
}

export interface RawHeader extends HeaderFields {
  readonly magic: number;
  readonly version: number;
  readonly flags: number;
  readonly headerCrc: number;
  readonly computedCrc: number;
}

/** ceil(a / b) for non-negative integers, exact (no float rounding). */
export function ceilDiv(a: number, b: number): number {
  const r = a % b;
  return (a - r) / b + (r === 0 ? 0 : 1);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Write the header (including its CRC-32) into out[0..26). */
export function writeHeader(out: Uint8Array, f: HeaderFields): void {
  const v = view(out);
  v.setUint16(OFFSETS.magic, MAGIC);
  v.setUint8(OFFSETS.version, FORMAT_VERSION);
  v.setUint8(OFFSETS.flags, 0);
  v.setUint32(OFFSETS.sessionId, f.sessionId);
  v.setUint32(OFFSETS.totalLength, f.totalLength);
  v.setUint16(OFFSETS.blockSize, f.blockSize);
  v.setUint32(OFFSETS.blockCount, f.blockCount);
  v.setUint32(OFFSETS.seq, f.seq);
  v.setUint32(OFFSETS.headerCrc, crc32(out, 0, HEADER_CRC_COVERAGE));
}

/** Read the header fields as written. Performs no validation. Requires length >= 26. */
export function readHeader(bytes: Uint8Array): RawHeader {
  const v = view(bytes);
  return {
    magic: v.getUint16(OFFSETS.magic),
    version: v.getUint8(OFFSETS.version),
    flags: v.getUint8(OFFSETS.flags),
    sessionId: v.getUint32(OFFSETS.sessionId),
    totalLength: v.getUint32(OFFSETS.totalLength),
    blockSize: v.getUint16(OFFSETS.blockSize),
    blockCount: v.getUint32(OFFSETS.blockCount),
    seq: v.getUint32(OFFSETS.seq),
    headerCrc: v.getUint32(OFFSETS.headerCrc),
    computedCrc: crc32(bytes, 0, HEADER_CRC_COVERAGE),
  };
}

