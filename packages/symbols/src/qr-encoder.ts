// The only file that imports `qr` (R11.5). Encoder only: the qr decoder is never used.
import { encodeQR } from "qr";
import { bytesToLatin1, latin1TextEncoder } from "./bytes.js";
import type { Encoder } from "./encoder.js";
import { SymbolError } from "./errors.js";
import { matrixFromRows, readFormat } from "./matrix.js";
import type { EccLevel } from "./types.js";

const ECC_NAME = { L: "low", M: "medium", Q: "quartile", H: "high" } as const;

export function createQrEncoder(): Encoder {
  return {
    encode(bytes, ecc: EccLevel, version) {
      let rows: boolean[][];
      try {
        rows = encodeQR(bytesToLatin1(bytes), "raw", {
          ecc: ECC_NAME[ecc],
          version,
          encoding: "byte", // forces byte mode, no auto-detection (R1.13)
          textEncoder: (s: string) => latin1TextEncoder.encode(s),
          border: 1, // qr rejects border 0, so one ring is requested and sliced off below (R2.2)
        });
      } catch (e) {
        throw new SymbolError("ENCODE_FAILED", `qr failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Drop the one-module padding ring: the Quiet_Zone is a rendering option, not part of the matrix (R2.2).
      const inner = rows.slice(1, -1).map((r) => r.slice(1, -1));
      const provisional = matrixFromRows(inner, version, ecc, 0);
      const fmt = readFormat(provisional);
      if (fmt === undefined || fmt.ecc !== ecc) {
        throw new SymbolError("ENCODE_FAILED", "qr returned a symbol whose format information does not match the request");
      }
      return { ...provisional, mask: fmt.mask };
    },
  };
}
