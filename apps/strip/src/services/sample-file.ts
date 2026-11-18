// The built-in sample the Home specimen and the gallery draw their codes from. Deterministic: no clock, no Math.random.
import { encode } from "@strip/codec";
import { encodeSymbol, type SymbolMatrix } from "@strip/symbols";
export const SAMPLE_NAME = "field-notes-2026.pdf";
export const SAMPLE_MIME = "application/pdf";
/** Deterministic sample content: enough bytes for at least six Packets of 1,732 bytes. */
export function sampleBytes(length = 12_000): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 131 + (i >> 8) * 7 + 5) & 255);
}
export interface SampleSymbol {
  packet: Uint8Array;
  matrix: SymbolMatrix;
}
/** The first n Packets of the sample as version-30 ECC-L symbols (the QR_DEFAULTS.print cell). */
export async function sampleSymbols(n: number): Promise<SampleSymbol[]> {
  const e = await encode({ bytes: sampleBytes(), name: SAMPLE_NAME, mime: SAMPLE_MIME }, { packetSize: 1732 });
  return Array.from({ length: n }, () => {
    const packet = e.next();
    return { packet, matrix: encodeSymbol(packet, { version: 30, ecc: "L" }) };
  });
}
