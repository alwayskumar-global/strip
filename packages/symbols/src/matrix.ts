// Renderer-independent description of a QR symbol (R2.1).
import { SymbolError } from "./errors.js";
import type { EccLevel } from "./types.js";

export type SymbolMatrix = {
  /** 17 + 4 * version. */
  readonly size: number;
  /** Row-major, length size * size, true = dark. */
  readonly modules: readonly boolean[];
  readonly version: number;
  readonly ecc: EccLevel;
  /** 0..7. */
  readonly mask: number;
};

/** Builds a SymbolMatrix from rows of booleans. Throws ENCODE_FAILED when the shape is not a QR size. */
export function matrixFromRows(rows: readonly (readonly boolean[])[], version: number, ecc: EccLevel, mask: number): SymbolMatrix {
  const size = 17 + 4 * version;
  if (rows.length !== size || rows.some((r) => r.length !== size)) {
    throw new SymbolError("ENCODE_FAILED", `encoder returned a ${rows.length}-row matrix, expected size ${size}`);
  }
  const modules: boolean[] = new Array<boolean>(size * size);
  for (let y = 0; y < size; y++) {
    const row = rows[y] as readonly boolean[];
    for (let x = 0; x < size; x++) modules[y * size + x] = row[x] === true;
  }
  return { size, modules, version, ecc, mask };
}

export function moduleAt(m: SymbolMatrix, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= m.size || y >= m.size) return false;
  return m.modules[y * m.size + x] === true;
}

// Format information (ISO/IEC 18004): 5 data bits (2 ECC bits, 3 mask bits), 10 BCH bits, XOR 0x5412.
const ECC_BITS: Readonly<Record<EccLevel, number>> = { L: 1, M: 0, Q: 3, H: 2 };
export function formatWord(ecc: EccLevel, mask: number): number {
  const data = (ECC_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

/** Reads the first copy of the format information (around the top-left finder) and returns the matching ecc and mask. */
export function readFormat(m: SymbolMatrix): { ecc: EccLevel; mask: number } | undefined {
  let bits = 0;
  const set = (i: number, x: number, y: number): void => {
    if (moduleAt(m, x, y)) bits |= 1 << i;
  };
  for (let i = 0; i <= 5; i++) set(i, 8, i);
  set(6, 8, 7);
  set(7, 8, 8);
  set(8, 7, 8);
  for (let i = 9; i < 15; i++) set(i, 14 - i, 8);
  for (const ecc of ["L", "M", "Q", "H"] as const) {
    for (let mask = 0; mask < 8; mask++) if (formatWord(ecc, mask) === bits) return { ecc, mask };
  }
  return undefined;
}
