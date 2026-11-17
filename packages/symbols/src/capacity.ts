// Byte-mode capacities (R1.4) and the measured defaults (R14.1). Defined here, with no runtime import from @strip/codec.
import type { EccLevel } from "./types.js";


/** Byte-mode capacity per version 1..40 (index v - 1) in the order L, M, Q, H. */
const TABLE: ReadonlyArray<readonly [number, number, number, number]> = [
  [17, 14, 11, 7], [32, 26, 20, 14], [53, 42, 32, 24], [78, 62, 46, 34], [106, 84, 60, 44],
  [134, 106, 74, 58], [154, 122, 86, 64], [192, 152, 108, 84], [230, 180, 130, 98], [271, 213, 151, 119],
  [321, 251, 177, 137], [367, 287, 203, 155], [425, 331, 241, 177], [458, 362, 258, 194], [520, 412, 292, 220],
  [586, 450, 322, 250], [644, 504, 364, 280], [718, 560, 394, 310], [792, 624, 442, 338], [858, 666, 482, 382],
  [929, 711, 509, 403], [1003, 779, 565, 439], [1091, 857, 611, 461], [1171, 911, 661, 511], [1273, 997, 715, 535],
  [1367, 1059, 751, 593], [1465, 1125, 805, 625], [1528, 1190, 868, 658], [1628, 1264, 908, 698], [1732, 1370, 982, 742],
  [1840, 1452, 1030, 790], [1952, 1538, 1112, 842], [2068, 1628, 1168, 898], [2188, 1722, 1228, 958], [2303, 1809, 1283, 983],
  [2431, 1911, 1351, 1051], [2563, 1989, 1423, 1093], [2699, 2099, 1499, 1139], [2809, 2213, 1579, 1219], [2953, 2331, 1663, 1273],
];

export type CapacityRow = Readonly<Record<EccLevel, number>>;
const rows: CapacityRow[] = TABLE.map(([L, M, Q, H]) => Object.freeze({ L, M, Q, H }));

/** Byte-mode capacity for every version 1..40 at every ECC level. Index with `QR_CAPACITY_BY_VERSION[version]`. */
export const QR_CAPACITY_BY_VERSION: Readonly<Record<number, CapacityRow>> = Object.freeze(
  Object.fromEntries(rows.map((r, i) => [i + 1, r])),
);

/** Capacity at version 40 (R1.4). */
export const QR_CAPACITY: CapacityRow = rows[39] as CapacityRow;

export type SymbolDefaults = {
  readonly version: number;
  readonly ecc: EccLevel;
  readonly packetSize: number;
  readonly minPixelsPerModule: number;
};
/**
 * Measured defaults (R14.1). Screen and print share one cell: version 30, ECC L, 1732-byte packet, 4 px/module,
 * valid while capture blur sigma is at most 1 px. Keep a symbol within about 70% of the short side of the camera
 * frame (R14.6). Version and ECC stay overridable (R1.12).
 */
export const QR_DEFAULTS: Readonly<{ screen: SymbolDefaults; print: SymbolDefaults }> = Object.freeze({
  screen: Object.freeze({ version: 30, ecc: "L" as const, packetSize: 1732, minPixelsPerModule: 4 }),
  print: Object.freeze({ version: 30, ecc: "L" as const, packetSize: 1732, minPixelsPerModule: 4 }),
});

/** Capacity of one (version, ecc) cell. */
export function capacityOf(version: number, ecc: EccLevel): number {
  const row = QR_CAPACITY_BY_VERSION[version];
  if (row === undefined) throw new RangeError(`version out of range: ${version}`);
  return row[ecc];
}

/** Smallest version 1..40 whose capacity at `ecc` is at least `length`, or undefined when none fits (R1.2). */
export function smallestVersion(length: number, ecc: EccLevel): number | undefined {
  for (let v = 1; v <= 40; v++) if (capacityOf(v, ecc) >= length) return v;
  return undefined;
}


