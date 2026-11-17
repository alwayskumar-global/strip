// Internal Encoder interface (R11.6). The public API never exposes a QR library type (R11.7).
import type { SymbolMatrix } from "./matrix.js";
import type { EccLevel } from "./types.js";

export interface Encoder {
  /** Encodes `bytes` in byte mode, one segment, at exactly `version` and `ecc`. Throws SymbolError ENCODE_FAILED on failure. */
  encode(bytes: Uint8Array, ecc: EccLevel, version: number): SymbolMatrix;
}
