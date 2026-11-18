// View-models of the Send on paper boards (SendPaper renderVals, with the file and page facts lifted out of the board's literals).
import type { SymbolMatrix } from "@strip/symbols";
export type PaperSize = "a4" | "letter";
export interface PaperTile {
  matrix: SymbolMatrix;
  /** "P1·01" */
  label: string;
  /** "1/149" */
  of: string;
}
export interface PaperPageVM {
  /** "" for the previewed page, "paper--off" for the others (hidden on screen only, shown in print). */
  cls: string;
  /** "Page 1 of 17 preview" */
  aria: string;
  name: string;
  meta: string;
  page: string;
  session: string;
  tiles: PaperTile[];
}
export interface PaperInput {
  size: PaperSize;
  /** "field-notes-2026.pdf · 184 KB" */
  fileTag: string;
  /** Zero-based index of the previewed page. */
  previewIndex: number;
  /** "149 · 9 per page · includes repair" */
  codesLine: string;
  session: string;
  hash: [string, string, string];
  /** The pages to render; the container passes all N, the gallery fixture only the first. */
  pages: ReadonlyArray<Omit<PaperPageVM, "cls">>;
  /** Total page count N (the board shows 17 although the board has one article). */
  total: number;
  rootCls?: string;
}
export interface PaperVM {
  rootCls: string;
  fileTag: string;
  a4On: boolean;
  letterOn: boolean;
  preview: string;
  prevOff: boolean;
  nextOff: boolean;
  codesLine: string;
  session: string;
  hash: [string, string, string];
  printLabel: string;
  pages: PaperPageVM[];
}
export function toPaperVM(i: PaperInput): PaperVM {
  return {
    rootCls: i.rootCls ?? "",
    fileTag: i.fileTag,
    a4On: i.size === "a4",
    letterOn: i.size === "letter",
    preview: `${i.previewIndex + 1} / ${i.total}`,
    prevOff: i.previewIndex <= 0,
    nextOff: i.previewIndex >= i.total - 1,
    codesLine: i.codesLine,
    session: i.session,
    hash: i.hash,
    printLabel: i.total === 1 ? "Print 1 page" : `Print ${i.total} pages`,
    pages: i.pages.map((p, k) => ({ ...p, cls: k === i.previewIndex ? "" : "paper--off" })),
  };
}
