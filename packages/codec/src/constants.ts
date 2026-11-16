/** First two bytes of every Packet: ASCII "ST". */
export const MAGIC = 0x5354;
export const FORMAT_VERSION = 1;
export const METADATA_VERSION = 1;

/** Fixed header size in bytes, including the header CRC-32. */
export const HEADER_SIZE = 26;
/** Bytes covered by the header CRC-32 (everything before it). */
export const HEADER_CRC_COVERAGE = 22;
export const CRC_SIZE = 4;
/** Header plus trailing CRC: packetSize = blockSize + PACKET_OVERHEAD. */
export const PACKET_OVERHEAD = HEADER_SIZE + CRC_SIZE;

export const MIN_BLOCK_SIZE = 16;
export const MAX_BLOCK_SIZE = 65535;
export const MIN_PACKET_SIZE = MIN_BLOCK_SIZE + PACKET_OVERHEAD;
export const MAX_PACKET_SIZE = MAX_BLOCK_SIZE + PACKET_OVERHEAD;

/** QR version 40, byte mode, error correction L holds 2953 bytes. */
export const DEFAULT_PACKET_SIZE = 2953;
export const DEFAULT_MAX_PAYLOAD_BYTES = 33_554_432;
export const DEFAULT_MAX_BLOCK_COUNT = 16_384;
export const DEFAULT_MAX_GAUSSIAN_BLOCKS = 1024;

export const MAX_NAME_BYTES = 255;
export const MAX_MIME_BYTES = 127;
export const SHA256_BYTES = 32;

export const UINT32_MAX = 0xffff_ffff;
