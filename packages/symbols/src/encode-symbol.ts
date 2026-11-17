// encodeSymbol (R1): validate, check capacity, pick the version, delegate to the Encoder.
import { QR_CAPACITY, capacityOf, smallestVersion } from "./capacity.js";
import type { Encoder } from "./encoder.js";
import { SymbolError } from "./errors.js";
import type { SymbolMatrix } from "./matrix.js";
import { createQrEncoder } from "./qr-encoder.js";
import type { EncodeOptions } from "./types.js";
import { assertBytes, assertEncodeOptions } from "./validate.js";

/** Same as encodeSymbol with an injected Encoder (R11.6). Internal: not part of the barrel. */
export function encodeSymbolWith(encoder: Encoder, bytes: Uint8Array, options?: EncodeOptions): SymbolMatrix {
  assertBytes(bytes);
  assertEncodeOptions(options);
  const ecc = options?.ecc ?? "L";
  let version = options?.version;
  if (version !== undefined) {
    if (bytes.length > capacityOf(version, ecc)) {
      throw new SymbolError("PACKET_TOO_LARGE", `${bytes.length} bytes do not fit version ${version} at ECC ${ecc}`);
    }
  } else {
    version = bytes.length > QR_CAPACITY[ecc] ? undefined : smallestVersion(bytes.length, ecc);
    if (version === undefined) {
      throw new SymbolError("PACKET_TOO_LARGE", `${bytes.length} bytes exceed the capacity ${QR_CAPACITY[ecc]} at ECC ${ecc}`);
    }
  }
  return encoder.encode(bytes, ecc, version);
}

let defaultEncoder: Encoder | undefined;
export function encodeSymbol(bytes: Uint8Array, options?: EncodeOptions): SymbolMatrix {
  defaultEncoder ??= createQrEncoder();
  return encodeSymbolWith(defaultEncoder, bytes, options);
}
