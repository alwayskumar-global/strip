// Hand-written input validators. Every failure throws CodecError(INVALID_INPUT).
import { MAX_PACKET_SIZE, MIN_PACKET_SIZE, UINT32_MAX } from "./constants.js";
import { CodecError } from "./errors.js";

export function invalidInput(message: string): never {
  throw new CodecError("INVALID_INPUT", message);
}

export function assertInteger(name: string, value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return invalidInput(`${name} must be an integer`);
  }
  if (value < min || value > max) {
    return invalidInput(`${name} must be in [${min}, ${max}]`);
  }
  return value;
}

export function assertUint32(name: string, value: unknown): number {
  return assertInteger(name, value, 0, UINT32_MAX);
}

export function assertUint8Array(name: string, value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) return invalidInput(`${name} must be a Uint8Array`);
  return value;
}

export function assertString(name: string, value: unknown): string {
  if (typeof value !== "string") return invalidInput(`${name} must be a string`);
  return value;
}

export function assertFunction<T extends (...args: never[]) => unknown>(name: string, value: unknown): T {
  if (typeof value !== "function") return invalidInput(`${name} must be a function`);
  return value as T;
}

export function assertObject(name: string, value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidInput(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

/** packetSize: integer in [46, 65565] (blockSize in [16, 65535]). */
export function validatePacketSize(value: unknown): number {
  return assertInteger("packetSize", value, MIN_PACKET_SIZE, MAX_PACKET_SIZE);
}

/** repairCount: integer in [0, 2^32 - 1 - K]. */
export function validateRepairCount(value: unknown, blockCount: number): number {
  return assertInteger("repairCount", value, 0, UINT32_MAX - blockCount);
}

export function validateMaxPayloadBytes(value: unknown): number {
  return assertInteger("maxPayloadBytes", value, 1, Number.MAX_SAFE_INTEGER);
}

export function validateMaxBlockCount(value: unknown): number {
  return assertInteger("maxBlockCount", value, 1, Number.MAX_SAFE_INTEGER);
}

export function validateMaxGaussianBlocks(value: unknown): number {
  return assertInteger("maxGaussianBlocks", value, 0, Number.MAX_SAFE_INTEGER);
}

export interface PayloadShape {
  readonly bytes: Uint8Array;
  readonly name: string;
  readonly mime: string;
}

/** Shape check only. Name and MIME content rules are enforced by the metadata serializer. */
export function validatePayloadShape(value: unknown): PayloadShape {
  const o = assertObject("payload", value);
  return {
    bytes: assertUint8Array("payload.bytes", o["bytes"]),
    name: assertString("payload.name", o["name"]),
    mime: assertString("payload.mime", o["mime"]),
  };
}

export function validatePacketBytes(value: unknown): Uint8Array {
  return assertUint8Array("packet", value);
}
