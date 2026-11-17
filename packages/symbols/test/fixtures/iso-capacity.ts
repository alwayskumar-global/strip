// ISO_Capacity_Table: maximum byte-mode data length in a single segment (no ECI), per version and ECC level.
// Source: ISO/IEC 18004 (QR Code), byte-mode capacities per version and error-correction level, as in the widely
// published capacity table. Row = version 1..40, columns = L, M, Q, H. Data only: this file must not import from src.
// Cross-check done when it was typed: every cell equals floor((dataCodewords * 8 - 4 - countBits) / 8) with
// countBits = 8 for versions 1..9 and 16 for versions 10..40, using the total-codewords and error-correction-block
// tables of the qr package (0 mismatches over all 160 cells).
export const ISO_CAPACITY_TABLE: ReadonlyArray<readonly [number, number, number, number]> = [
  [17, 14, 11, 7], // v1
  [32, 26, 20, 14], // v2
  [53, 42, 32, 24], // v3
  [78, 62, 46, 34], // v4
  [106, 84, 60, 44], // v5
  [134, 106, 74, 58], // v6
  [154, 122, 86, 64], // v7
  [192, 152, 108, 84], // v8
  [230, 180, 130, 98], // v9
  [271, 213, 151, 119], // v10
  [321, 251, 177, 137], // v11
  [367, 287, 203, 155], // v12
  [425, 331, 241, 177], // v13
  [458, 362, 258, 194], // v14
  [520, 412, 292, 220], // v15
  [586, 450, 322, 250], // v16
  [644, 504, 364, 280], // v17
  [718, 560, 394, 310], // v18
  [792, 624, 442, 338], // v19
  [858, 666, 482, 382], // v20
  [929, 711, 509, 403], // v21
  [1003, 779, 565, 439], // v22
  [1091, 857, 611, 461], // v23
  [1171, 911, 661, 511], // v24
  [1273, 997, 715, 535], // v25
  [1367, 1059, 751, 593], // v26
  [1465, 1125, 805, 625], // v27
  [1528, 1190, 868, 658], // v28
  [1628, 1264, 908, 698], // v29
  [1732, 1370, 982, 742], // v30
  [1840, 1452, 1030, 790], // v31
  [1952, 1538, 1112, 842], // v32
  [2068, 1628, 1168, 898], // v33
  [2188, 1722, 1228, 958], // v34
  [2303, 1809, 1283, 983], // v35
  [2431, 1911, 1351, 1051], // v36
  [2563, 1989, 1423, 1093], // v37
  [2699, 2099, 1499, 1139], // v38
  [2809, 2213, 1579, 1219], // v39
  [2953, 2331, 1663, 1273], // v40
];
