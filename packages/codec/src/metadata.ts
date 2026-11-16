import { MAX_MIME_BYTES, MAX_NAME_BYTES, METADATA_VERSION, SHA256_BYTES, UINT32_MAX } from "./constants.js";
import { CodecError } from "./errors.js";
import { assertInteger, assertObject, assertString, assertUint8Array, invalidInput } from "./validate.js";

export interface Metadata {
  readonly name: string;
  readonly mime: string;
  readonly byteLength: number;
  /** SHA-256 of the payload bytes, 32 bytes. */
  readonly sha256: Uint8Array;
}

const bad = (message: string): never => {
  throw new CodecError("BAD_METADATA", message);
};

/** Strict UTF-8 encoder. Lone surrogates are rejected with BAD_METADATA. */
export function encodeUtf8(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff) {
      const lo = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (lo < 0xdc00 || lo > 0xdfff) return bad("lone surrogate in string");
      cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
      i++;
    } else if (cp >= 0xdc00 && cp <= 0xdfff) {
      return bad("lone surrogate in string");
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}

/** Strict UTF-8 decoder: rejects overlong forms, surrogates, code points above U+10FFFF and bad sequences. */
export function decodeUtf8(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk: number[] = [];
  const at = (i: number): number => bytes[i] ?? -1;
  const cont = (i: number, lo = 0x80, hi = 0xbf): number => {
    const b = at(i);
    if (b < lo || b > hi) return bad("invalid UTF-8");
    return b & 0x3f;
  };
  for (let i = 0; i < bytes.length; ) {
    const b = at(i);
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b >= 0xc2 && b <= 0xdf) {
      cp = ((b & 0x1f) << 6) | cont(i + 1);
      i += 2;
    } else if (b >= 0xe0 && b <= 0xef) {
      const lo = b === 0xe0 ? 0xa0 : 0x80;
      const hi = b === 0xed ? 0x9f : 0xbf;
      cp = ((b & 0x0f) << 12) | (cont(i + 1, lo, hi) << 6) | cont(i + 2);
      i += 3;
    } else if (b >= 0xf0 && b <= 0xf4) {
      const lo = b === 0xf0 ? 0x90 : 0x80;
      const hi = b === 0xf4 ? 0x8f : 0xbf;
      cp = ((b & 0x07) << 18) | (cont(i + 1, lo, hi) << 12) | (cont(i + 2) << 6) | cont(i + 3);
      i += 4;
    } else {
      return bad("invalid UTF-8");
    }
    chunk.push(cp);
    if (chunk.length >= 4096) {
      parts.push(String.fromCodePoint(...chunk));
      chunk = [];
    }
  }
  if (chunk.length > 0) parts.push(String.fromCodePoint(...chunk));
  return parts.join("");
}

/** Name rules (R1.4) on an already-decoded string; returns its UTF-8 bytes. */
function checkName(name: string): Uint8Array {
  if (name.length === 0) return bad("file name is empty");
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return bad("file name contains a control character");
    if (c === 0x2f || c === 0x5c) return bad("file name contains a path separator");
  }
  if (name === "." || name === "..") return bad("file name is a dot name");
  const utf8 = encodeUtf8(name);
  if (utf8.length > MAX_NAME_BYTES) return bad(`file name exceeds ${MAX_NAME_BYTES} UTF-8 bytes`);
  return utf8;
}

/** MIME rules (R1.5) on a string; returns its ASCII bytes. */
function checkMime(mime: string): Uint8Array {
  if (mime.length > MAX_MIME_BYTES) return bad(`MIME type exceeds ${MAX_MIME_BYTES} bytes`);
  const out = new Uint8Array(mime.length);
  for (let i = 0; i < mime.length; i++) {
    const c = mime.charCodeAt(i);
    if (c > 0x7f) return bad("MIME type contains a non-ASCII byte");
    out[i] = c;
  }
  return out;
}

export function serializeMetadata(m: Metadata): Uint8Array {
  const o = assertObject("metadata", m);
  const name = assertString("metadata.name", o["name"]);
  const mime = assertString("metadata.mime", o["mime"]);
  const byteLength = assertInteger("metadata.byteLength", o["byteLength"], 0, UINT32_MAX);
  const sha = assertUint8Array("metadata.sha256", o["sha256"]);
  if (sha.length !== SHA256_BYTES) invalidInput("metadata.sha256 must be 32 bytes");

  const nameBytes = checkName(name);
  const mimeBytes = checkMime(mime);
  const out = new Uint8Array(1 + 2 + nameBytes.length + 1 + mimeBytes.length + 4 + SHA256_BYTES);
  const v = new DataView(out.buffer);
  let p = 0;
  out[p++] = METADATA_VERSION;
  v.setUint16(p, nameBytes.length);
  p += 2;
  out.set(nameBytes, p);
  p += nameBytes.length;
  out[p++] = mimeBytes.length;
  out.set(mimeBytes, p);
  p += mimeBytes.length;
  v.setUint32(p, byteLength);
  p += 4;
  out.set(sha, p);
  return out;
}

/**
 * Length in bytes of the Metadata_Record at the start of `bytes`, read from the record's own
 * length fields. Needs the bytes up to and including the MIME length field, not the whole record.
 */
export function readRecordLength(bytes: Uint8Array): number {
  assertUint8Array("bytes", bytes);
  if (bytes.length < 1) return bad("record is empty");
  if (bytes[0] !== METADATA_VERSION) throw new CodecError("UNSUPPORTED_VERSION", `unsupported metadata version ${bytes[0]}`);
  if (bytes.length < 3) return bad("record is truncated");
  const nameLen = (bytes[1] as number) * 256 + (bytes[2] as number);
  const mimeLenAt = 3 + nameLen;
  if (bytes.length <= mimeLenAt) return bad("record is truncated");
  return mimeLenAt + 1 + (bytes[mimeLenAt] as number) + 4 + SHA256_BYTES;
}

/** Parse exactly one Metadata_Record. Trailing bytes, truncation and length overruns are BAD_METADATA. */
export function parseMetadata(bytes: Uint8Array): Metadata {
  assertUint8Array("bytes", bytes);
  const total = readRecordLength(bytes);
  if (bytes.length < total) return bad("record is truncated");
  if (bytes.length > total) return bad("record has trailing bytes");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const nameLen = v.getUint16(1);
  const name = decodeUtf8(bytes.subarray(3, 3 + nameLen));
  checkName(name);
  const mimeLenAt = 3 + nameLen;
  const mimeLen = bytes[mimeLenAt] as number;
  const mimeStart = mimeLenAt + 1;
  const mimeBytes = bytes.subarray(mimeStart, mimeStart + mimeLen);
  let mime = "";
  for (const b of mimeBytes) {
    if (b > 0x7f) return bad("MIME type contains a non-ASCII byte");
    mime += String.fromCharCode(b);
  }
  const byteLength = v.getUint32(mimeStart + mimeLen);
  const sha256 = bytes.slice(mimeStart + mimeLen + 4, total);
  return { name, mime, byteLength, sha256 };
}
