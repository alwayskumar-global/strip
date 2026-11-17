// Independent structural checker for QR symbols, written from ISO/IEC 18004 (finder, separator, timing, dark module,
// format information, version information). It imports only the matrix type from src.
import type { SymbolMatrix } from "../../src/matrix.js";

const at = (m: SymbolMatrix, x: number, y: number): boolean => m.modules[y * m.size + x] === true;

/** Remainder of a GF(2) polynomial: `value` modulo `poly` (poly has degree `degree`). */
function remainder(value: number, poly: number, degree: number): number {
  let v = value;
  for (let bit = 31; bit >= degree; bit--) {
    if ((v >>> bit) & 1) v ^= poly << (bit - degree);
  }
  return v;
}

const ECC_FROM_BITS: Record<number, string> = { 1: "L", 0: "M", 3: "Q", 2: "H" };

export function structureViolations(m: SymbolMatrix): string[] {
  const out: string[] = [];
  const n = m.size;
  if (n !== 17 + 4 * m.version) out.push(`size ${n} != 17 + 4 * ${m.version}`);
  if (m.modules.length !== n * n) out.push(`modules.length ${m.modules.length} != ${n * n}`);
  if (out.length > 0) return out;

  for (const [ox, oy] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        if (at(m, ox + dx, oy + dy) !== (ring !== 2)) out.push(`finder at (${ox},${oy}) wrong at (${dx},${dy})`);
      }
    }
  }
  const sep = (x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < n && y < n && at(m, x, y)) out.push(`separator module dark at (${x},${y})`);
  };
  for (let i = 0; i < 8; i++) {
    sep(7, i); sep(i, 7);
    sep(n - 8, i); sep(n - 1 - i, 7);
    sep(7, n - 1 - i); sep(i, n - 8);
  }
  for (let i = 8; i <= n - 9; i++) {
    const dark = i % 2 === 0;
    if (at(m, i, 6) !== dark) out.push(`timing row wrong at x=${i}`);
    if (at(m, 6, i) !== dark) out.push(`timing column wrong at y=${i}`);
  }
  if (!at(m, 8, 4 * m.version + 9)) out.push("dark module missing");

  const copy1: Array<[number, number]> = [];
  for (let i = 0; i <= 5; i++) copy1.push([8, i]);
  copy1.push([8, 7], [8, 8], [7, 8]);
  for (let i = 9; i < 15; i++) copy1.push([14 - i, 8]);
  const copy2: Array<[number, number]> = [];
  for (let i = 0; i <= 7; i++) copy2.push([n - 1 - i, 8]);
  for (let i = 8; i < 15; i++) copy2.push([8, n - 15 + i]);
  const words = [copy1, copy2].map((cells) => cells.reduce((acc, [x, y], i) => acc | ((at(m, x, y) ? 1 : 0) << i), 0));
  if (words[0] !== words[1]) out.push("format information copies differ");
  for (const w of words) {
    const raw = w ^ 0x5412;
    if (remainder(raw, 0x537, 10) !== 0) out.push("format information fails the BCH check");
    const data = raw >>> 10;
    if (ECC_FROM_BITS[data >>> 3] !== m.ecc) out.push(`format information ECC ${String(ECC_FROM_BITS[data >>> 3])} != ${m.ecc}`);
    if ((data & 7) !== m.mask) out.push(`format information mask ${data & 7} != ${m.mask}`);
  }
  if (m.version >= 7) {
    const blockA = Array.from({ length: 18 }, (_, i): [number, number] => [n - 11 + (i % 3), Math.floor(i / 3)]);
    const blockB = Array.from({ length: 18 }, (_, i): [number, number] => [Math.floor(i / 3), n - 11 + (i % 3)]);
    for (const cells of [blockA, blockB]) {
      const w = cells.reduce((acc, [x, y], i) => acc | ((at(m, x, y) ? 1 : 0) << i), 0);
      if (remainder(w, 0x1f25, 12) !== 0) out.push("version information fails the Golay check");
      if (w >>> 12 !== m.version) out.push(`version information ${w >>> 12} != ${m.version}`);
    }
  }
  return out;
}

/** Returns a copy of `m` with one module flipped. */
export function flipped(m: SymbolMatrix, x: number, y: number): SymbolMatrix {
  const modules = m.modules.slice();
  modules[y * m.size + x] = !modules[y * m.size + x];
  return { ...m, modules };
}
