export const ERROR_CODES = [
  "INVALID_INPUT",
  "PAYLOAD_TOO_LARGE",
  "TOO_MANY_BLOCKS",
  "BAD_METADATA",
  "BAD_HEADER",
  "UNSUPPORTED_VERSION",
  "BAD_CRC",
  "SESSION_MISMATCH",
  "INCOMPLETE_DECODE",
  "HASH_MISMATCH",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const IGNORE_REASONS = [
  "DUPLICATE_PACKET",
  "SESSION_MISMATCH",
  "ALREADY_COMPLETE",
  "DENSE_STORE_FULL",
] as const;

export type IgnoreReason = (typeof IGNORE_REASONS)[number];

export class CodecError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message.length > 0 ? message : code);
    this.name = "CodecError";
    this.code = code;
  }
}
