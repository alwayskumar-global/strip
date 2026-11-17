// Public barrel for @strip/codec. Pure and deterministic; depends on nothing.
export { createDecoder } from "./decoder.js";
export type { Decoder, DecoderOptions, HashPrefixes, Progress, PushStatus } from "./decoder.js";
export { encode } from "./encoder.js";
export type { EncodeOptions, Encoder, PayloadInput } from "./encoder.js";
export { CodecError, ERROR_CODES } from "./errors.js";
export type { ErrorCode, IgnoreReason } from "./errors.js";
export { sha256WebCrypto } from "./hash.js";
export type { HashFn } from "./hash.js";
export { parseMetadata, serializeMetadata } from "./metadata.js";
export type { Metadata } from "./metadata.js";
export { decodePacket, encodePacket } from "./packet.js";
export type { Limits, PacketFields } from "./packet.js";
