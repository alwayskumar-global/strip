import {
  DEFAULT_MAX_BLOCK_COUNT,
  DEFAULT_MAX_PAYLOAD_BYTES,
  FORMAT_VERSION,
  HEADER_SIZE,
  MAGIC,
  MAX_BLOCK_SIZE,
  MIN_BLOCK_SIZE,
  PACKET_OVERHEAD,
} from "./constants.js";
import { crc32 } from "./crc32.js";
import { CodecError } from "./errors.js";
import { ceilDiv, OFFSETS, readHeader, writeHeader } from "./header.js";
import {
  assertInteger,
  assertObject,
  assertUint32,
  assertUint8Array,
  invalidInput,
  validateMaxBlockCount,
  validateMaxPayloadBytes,
  validatePacketBytes,
} from "./validate.js";

export interface PacketFields {
  readonly sessionId: number;
  /** L: length of the Coded_Stream in bytes. */
  readonly totalLength: number;
  readonly blockSize: number;
  /** K: number of Blocks. */
  readonly blockCount: number;
  readonly seq: number;
  /** XOR payload, exactly blockSize bytes. */
  readonly payload: Uint8Array;
}

export interface Limits {
  readonly maxPayloadBytes?: number;
  readonly maxBlockCount?: number;
}

/** Serialize a Packet: 26-byte header, XOR payload, trailing CRC-32 over everything before it. */
export function encodePacket(p: PacketFields): Uint8Array {
  assertObject("packet", p);
  const sessionId = assertUint32("sessionId", p.sessionId);
  const totalLength = assertInteger("totalLength", p.totalLength, 1, 0xffffffff);
  const blockSize = assertInteger("blockSize", p.blockSize, MIN_BLOCK_SIZE, MAX_BLOCK_SIZE);
  const blockCount = assertUint32("blockCount", p.blockCount);
  const seq = assertUint32("seq", p.seq);
  const payload = assertUint8Array("payload", p.payload);
  if (payload.length !== blockSize) invalidInput("payload length must equal blockSize");
  if (blockCount !== ceilDiv(totalLength, blockSize)) {
    invalidInput("blockCount must equal ceil(totalLength / blockSize)");
  }
  const out = new Uint8Array(PACKET_OVERHEAD + blockSize);
  writeHeader(out, { sessionId, totalLength, blockSize, blockCount, seq });
  out.set(payload, OFFSETS.payload);
  const end = HEADER_SIZE + blockSize;
  new DataView(out.buffer).setUint32(end, crc32(out, 0, end));
  return out;
}

/**
 * Parse and verify a Packet. Check order (design, Wire formats):
 * 1 length, 2 header CRC, 3 magic and flags, 4 version, 5 L limit, 6 K limit,
 * 7 blockSize range and K == ceil(L / blockSize), 8 packet length, 9 trailing CRC.
 * No buffer is sized from L or K. The returned payload is a view into `bytes`.
 */
export function decodePacket(bytes: Uint8Array, limits?: Limits): PacketFields {
  validatePacketBytes(bytes);
  const maxPayloadBytes =
    limits?.maxPayloadBytes === undefined ? DEFAULT_MAX_PAYLOAD_BYTES : validateMaxPayloadBytes(limits.maxPayloadBytes);
  const maxBlockCount =
    limits?.maxBlockCount === undefined ? DEFAULT_MAX_BLOCK_COUNT : validateMaxBlockCount(limits.maxBlockCount);

  if (bytes.length < HEADER_SIZE) throw new CodecError("BAD_HEADER", "packet shorter than the header");
  const h = readHeader(bytes);
  if (h.headerCrc !== h.computedCrc) throw new CodecError("BAD_CRC", "header CRC-32 mismatch");
  if (h.magic !== MAGIC) throw new CodecError("BAD_HEADER", "bad magic");
  if (h.flags !== 0) throw new CodecError("BAD_HEADER", "reserved flags must be 0");
  if (h.version !== FORMAT_VERSION) throw new CodecError("UNSUPPORTED_VERSION", `unsupported version ${h.version}`);
  if (h.totalLength > maxPayloadBytes) throw new CodecError("PAYLOAD_TOO_LARGE", "total length exceeds maxPayloadBytes");
  if (h.blockCount > maxBlockCount) throw new CodecError("TOO_MANY_BLOCKS", "block count exceeds maxBlockCount");
  if (h.blockSize < MIN_BLOCK_SIZE || h.blockSize > MAX_BLOCK_SIZE) {
    throw new CodecError("BAD_HEADER", "blockSize out of range");
  }
  if (h.blockCount < 1 || h.blockCount !== ceilDiv(h.totalLength, h.blockSize)) {
    throw new CodecError("BAD_HEADER", "blockCount inconsistent with totalLength and blockSize");
  }
  if (bytes.length !== PACKET_OVERHEAD + h.blockSize) {
    throw new CodecError("BAD_HEADER", "packet length does not match blockSize");
  }
  const end = HEADER_SIZE + h.blockSize;
  const stored = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(end);
  if (stored !== crc32(bytes, 0, end)) throw new CodecError("BAD_CRC", "trailing CRC-32 mismatch");

  return {
    sessionId: h.sessionId,
    totalLength: h.totalLength,
    blockSize: h.blockSize,
    blockCount: h.blockCount,
    seq: h.seq,
    payload: bytes.subarray(OFFSETS.payload, end),
  };
}

