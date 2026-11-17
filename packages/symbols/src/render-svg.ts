// renderToSvg (R4): crisp, script-free SVG text. Colours go in `fill` presentation attributes only.
import type { SymbolMatrix } from "./matrix.js";
import type { RenderOptions } from "./types.js";
import { assertRenderOptions } from "./validate.js";

export function renderToSvg(m: SymbolMatrix, options: RenderOptions): string {
  assertRenderOptions(options);
  const qz = options.quietZone ?? 4;
  const w = m.size + 2 * qz;
  const dark = options.dark ?? "#000000";
  const light = options.light ?? "#ffffff";
  const physical = options.mm === undefined ? "" : ` width="${options.mm}mm" height="${options.mm}mm"`;
  let d = "";
  for (let y = 0; y < m.size; y++) {
    let x = 0;
    while (x < m.size) {
      if (m.modules[y * m.size + x] !== true) {
        x++;
        continue;
      }
      const start = x;
      while (x < m.size && m.modules[y * m.size + x] === true) x++;
      const n = x - start;
      d += `M${qz + start} ${qz + y}h${n}v1h-${n}z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}"${physical} shape-rendering="crispEdges">` +
    `<rect width="${w}" height="${w}" fill="${light}"/><path fill="${dark}" d="${d}"/></svg>`
  );
}
