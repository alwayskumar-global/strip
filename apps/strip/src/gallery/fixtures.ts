// Board instance values (design: Per-target fixtures). Harness-only.
import { encode } from "@strip/codec";
import { encodeSymbol, type SymbolMatrix } from "@strip/symbols";
export const SAMPLE_NAME = "field-notes-2026.pdf";
export const SAMPLE_BYTES = 188_416;
/** Deterministic bytes: no clock, no Math.random. */
export function sampleFile(): Uint8Array {
  return Uint8Array.from({ length: SAMPLE_BYTES }, (_, i) => (i * 131 + (i >> 8) * 7 + 5) & 255);
}
export interface Specimen {
  packet: Uint8Array;
  matrix: SymbolMatrix;
}
/** The first n Packets of the sample file as version-30 ECC-L symbols (the QR_DEFAULTS.print cell). */
export async function specimens(n: number): Promise<Specimen[]> {
  const e = await encode({ bytes: sampleFile(), name: SAMPLE_NAME, mime: "application/pdf" }, { packetSize: 1732 });
  return Array.from({ length: n }, () => {
    const packet = e.next();
    return { packet, matrix: encodeSymbol(packet, { version: 30, ecc: "L" }) };
  });
}
