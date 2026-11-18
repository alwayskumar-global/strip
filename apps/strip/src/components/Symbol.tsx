// Replaces the design Symbol board: the board's svg.code structure, built from the public SymbolMatrix.
import type { ReactNode } from "react";
import type { SymbolMatrix } from "@strip/symbols";
import { symbolPath, viewSide } from "./symbol-path.js";
export function Symbol({ matrix, label }: { matrix: SymbolMatrix; label: string }): ReactNode {
  const side = viewSide(matrix);
  return (
    <svg className="code" viewBox={`0 0 ${side} ${side}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect className="code__bg" width={side} height={side} />
      <path className="code__ink" d={symbolPath(matrix)} />
    </svg>
  );
}
