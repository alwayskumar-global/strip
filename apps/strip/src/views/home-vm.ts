// View-model of the Home board (Home.dc.html renderVals): the root class and the six specimen tiles.
import type { SymbolMatrix } from "@strip/symbols";
export interface HomeVM {
  /** "" on desktop; the gallery passes the board's mobile class. */
  rootCls: string;
  tiles: Array<{ matrix: SymbolMatrix }>;
}
export const SPECIMEN_LABEL = "Sample data code";
export function toHomeVM(symbols: ReadonlyArray<{ matrix: SymbolMatrix }>, rootCls = ""): HomeVM {
  return { rootCls, tiles: symbols.slice(0, 6).map((s) => ({ matrix: s.matrix })) };
}
