// Board instance values of the Send on paper boards (design: Per-target fixtures). Harness-only use.
import type { SymbolMatrix } from "@strip/symbols";
import type { PaperInput, PaperSize } from "./paper-vm.js";
export const isPaperSize = (s: string | null): s is PaperSize => s === "a4" || s === "letter";
const two = (i: number): string => (i < 10 ? `0${i}` : `${i}`);
/** The board's page 1 of 17: nine tiles P1·01 to P1·09 of 149 symbols; `matrices` supplies the nine symbols. */
export function paperInput(size: PaperSize, matrices: readonly SymbolMatrix[], rootCls = ""): PaperInput {
  return {
    size,
    fileTag: "field-notes-2026.pdf · 184 KB",
    previewIndex: 0,
    codesLine: "149 · 9 per page · includes repair",
    session: "7F3A",
    hash: ["a1b2", "c3d4", "e5f6"],
    total: 17,
    rootCls,
    pages: [
      {
        aria: "Page 1 of 17 preview",
        name: "field-notes-2026.pdf",
        meta: "184 KB · SHA-256 a1b2c3d4e5f6… · 149 symbols",
        page: "Page 1 of 17",
        session: "Session 7F3A",
        tiles: matrices.map((matrix, k) => ({ matrix, label: `P1·${two(k + 1)}`, of: `${k + 1}/149` })),
      },
    ],
  };
}
