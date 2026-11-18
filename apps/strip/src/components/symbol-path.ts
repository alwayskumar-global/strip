// Pure: the dark modules of a SymbolMatrix as one SVG path of merged horizontal runs, shifted by the 4-module quiet zone.
import type { SymbolMatrix } from "@strip/symbols";
export const QUIET = 4;
/** viewBox side of the Symbol: the matrix plus a quiet zone on each side. */
export const viewSide = (m: SymbolMatrix): number => m.size + 2 * QUIET;
export function symbolPath(m: SymbolMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (m.modules[y * m.size + x] !== true) {
        x++;
        continue;
      }
      const start = x;
      while (x < m.size && m.modules[y * m.size + x] === true) x++;
      parts.push(`M${start + QUIET} ${y + QUIET}h${x - start}v1h-${x - start}z`);
    }
  }
  return parts.join("");
}
