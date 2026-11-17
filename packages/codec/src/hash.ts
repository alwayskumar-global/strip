import { SHA256_BYTES } from "./constants.js";
import { CodecError } from "./errors.js";
import { assertFunction } from "./validate.js";

/** SHA-256 over `data`. May be sync or async, so the pure core stays testable. */
export type HashFn = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;

interface SubtleLike {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}

/** Default_Hash: SHA-256 through globalThis.crypto.subtle (Node and browsers). */
export const sha256WebCrypto: HashFn = async (data) => {
  const subtle = (globalThis as unknown as { crypto?: { subtle?: SubtleLike } }).crypto?.subtle;
  if (!subtle) throw new CodecError("INVALID_INPUT", "Web Crypto (crypto.subtle) is not available");
  return new Uint8Array(await subtle.digest("SHA-256", data));
};

/** Await a HashFn and check that it produced a 32-byte digest. Returns a private copy. */
export async function computeDigest(hash: HashFn, data: Uint8Array): Promise<Uint8Array> {
  assertFunction("hash", hash);
  const out = await hash(data);
  if (!(out instanceof Uint8Array) || out.length !== SHA256_BYTES) {
    throw new CodecError("INVALID_INPUT", "hash function must return a 32-byte Uint8Array");
  }
  return out.slice();
}
