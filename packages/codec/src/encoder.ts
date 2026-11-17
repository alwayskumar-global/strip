import { DEFAULT_MAX_BLOCK_COUNT, DEFAULT_MAX_PAYLOAD_BYTES, DEFAULT_PACKET_SIZE, HEADER_SIZE, PACKET_OVERHEAD, UINT32_MAX } from "./constants.js";
import { crc32 } from "./crc32.js";
import { CodecError } from "./errors.js";
import { DEFAULT_FORMAT, type FormatParams } from "./format.js";
import { ceilDiv, writeHeader } from "./header.js";
import { computeDigest, sha256WebCrypto, type HashFn } from "./hash.js";
import { serializeMetadata } from "./metadata.js";
import { Neighbors } from "./neighbors.js";
import { R } from "./overhead.js";
import { getSolitonTable } from "./soliton.js";
import {
  assertFunction,
  assertObject,
  assertUint32,
  validateMaxBlockCount,
  validateMaxPayloadBytes,
  validatePacketSize,
  validatePayloadShape,
  validateRepairCount,
} from "./validate.js";
import { BlockBuffer, xorSetInto } from "./xor.js";

export interface PayloadInput {
  readonly bytes: Uint8Array;
  readonly name: string;
  readonly mime: string;
}

export interface EncodeOptions {
  /** Total bytes of one Packet. Default 2953 (QR version 40, byte mode, level L). */
  readonly packetSize?: number;
  /** Repair packets in page(). Default R(K) from the overhead table. */
  readonly repairCount?: number;
  readonly maxPayloadBytes?: number;
  readonly maxBlockCount?: number;
  readonly hash?: HashFn;
}

export interface Encoder {
  /** Next Packet of the infinite stream: 0..K-1, then K, K+1, ...; wraps from 2^32-1 to K. */
  next(): Uint8Array;
  /** All K systematic Packets plus repairCount repair Packets, ascending seq. Views over one buffer. */
  page(): Uint8Array[];
  readonly sessionId: number;
  readonly K: number;
  readonly blockSize: number;
  readonly packetSize: number;
  readonly totalLength: number;
}

/** Internal knobs for tests and calibration. Not part of the public API. */
export interface EncodeInternals {
  readonly format?: FormatParams;
  /** First sequence number next() returns. */
  readonly startSeq?: number;
}

/** Coded_Stream = Metadata_Record followed directly by the Payload bytes (R1.2). */
export function buildCodedStream(record: Uint8Array, bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(record.length + bytes.length);
  out.set(record, 0);
  out.set(bytes, record.length);
  return out;
}

export function encode(payload: PayloadInput, options?: EncodeOptions): Promise<Encoder> {
  return encodeWith(payload, options, {});
}

/** encode() with internal overrides (format constants, start sequence). */
export async function encodeWith(payload: unknown, options: unknown, internals: EncodeInternals): Promise<Encoder> {
  const shape = validatePayloadShape(payload);
  const o: Record<string, unknown> = options === undefined ? {} : assertObject("options", options);
  const packetSize = o["packetSize"] === undefined ? DEFAULT_PACKET_SIZE : validatePacketSize(o["packetSize"]);
  const maxPayloadBytes = o["maxPayloadBytes"] === undefined ? DEFAULT_MAX_PAYLOAD_BYTES : validateMaxPayloadBytes(o["maxPayloadBytes"]);
  const maxBlockCount = o["maxBlockCount"] === undefined ? DEFAULT_MAX_BLOCK_COUNT : validateMaxBlockCount(o["maxBlockCount"]);
  const hash = o["hash"] === undefined ? sha256WebCrypto : assertFunction<HashFn>("hash", o["hash"]);
  const format = internals.format ?? DEFAULT_FORMAT;
  const startSeq = internals.startSeq === undefined ? 0 : assertUint32("startSeq", internals.startSeq);

  if (shape.bytes.length > maxPayloadBytes) {
    throw new CodecError("PAYLOAD_TOO_LARGE", `payload of ${shape.bytes.length} bytes exceeds maxPayloadBytes`);
  }

  const sha256 = await computeDigest(hash, shape.bytes);
  const record = serializeMetadata({ name: shape.name, mime: shape.mime, byteLength: shape.bytes.length, sha256 });
  const totalLength = record.length + shape.bytes.length;
  if (totalLength > UINT32_MAX) throw new CodecError("PAYLOAD_TOO_LARGE", "coded stream does not fit a 32-bit length");
  const sessionId = new DataView((await computeDigest(hash, record)).buffer).getUint32(0);

  const blockSize = packetSize - PACKET_OVERHEAD;
  const K = ceilDiv(totalLength, blockSize);
  if (K > maxBlockCount) throw new CodecError("TOO_MANY_BLOCKS", `${K} blocks exceed maxBlockCount ${maxBlockCount}`);
  const repairCount = o["repairCount"] === undefined ? R(K) : validateRepairCount(o["repairCount"], K);

  const stream = buildCodedStream(record, shape.bytes);
  const store = new BlockBuffer(K, blockSize);
  for (let i = 0; i < K; i++) store.block(i).set(stream.subarray(i * blockSize, Math.min(totalLength, (i + 1) * blockSize)));

  const neighbors = new Neighbors(K, getSolitonTable(K, format), format.D);
  const setBuf = new Uint32Array(K);
  const scratch = new BlockBuffer(1, blockSize);
  const end = HEADER_SIZE + blockSize;

  const fill = (seq: number, out: Uint8Array): void => {
    writeHeader(out, { sessionId, totalLength, blockSize, blockCount: K, seq });
    if (seq < K) {
      out.set(store.block(seq), HEADER_SIZE);
    } else {
      const n = neighbors.select(sessionId, seq, setBuf);
      xorSetInto(scratch, 0, store, setBuf, n);
      out.set(scratch.block(0), HEADER_SIZE);
    }
    const c = crc32(out, 0, end);
    out[end] = c >>> 24;
    out[end + 1] = (c >>> 16) & 0xff;
    out[end + 2] = (c >>> 8) & 0xff;
    out[end + 3] = c & 0xff;
  };

  let cursor = startSeq;
  return {
    next(): Uint8Array {
      const out = new Uint8Array(packetSize);
      fill(cursor, out);
      cursor = cursor === UINT32_MAX ? K : cursor + 1;
      return out;
    },
    page(): Uint8Array[] {
      const count = K + repairCount;
      const buf = new ArrayBuffer(count * packetSize);
      const packets: Uint8Array[] = [];
      for (let seq = 0; seq < count; seq++) {
        const view = new Uint8Array(buf, seq * packetSize, packetSize);
        fill(seq, view);
        packets.push(view);
      }
      return packets;
    },
    sessionId,
    K,
    blockSize,
    packetSize,
    totalLength,
  };
}
