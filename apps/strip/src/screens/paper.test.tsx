import fc from "fast-check";
import type { Encoder } from "@strip/codec";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PAPER_WARN_BYTES } from "../limits.js";
import { buildPaperPages } from "../services/paper-pages.js";
import { printPage } from "../services/browser.js";
import { reducePaper } from "../state/paper.js";
import { paperWarnIf } from "../state/send-facts.js";
import { PaperView } from "../views/PaperView.js";
import { toPaperVM } from "../views/paper-vm.js";
const fakeEncoder = (T: number): Encoder => ({ page: () => Array.from({ length: T }, (_, i) => Uint8Array.from({ length: 1732 }, (_, j) => (i * 7 + j) & 255)), sessionId: 0x7f3a0000, K: T, blockSize: 1702, packetSize: 1732, totalLength: 0, next: () => new Uint8Array(0) });
const src = { bytes: new Uint8Array(1000), name: "f.bin", mime: "application/octet-stream", hash12: "a1b2c3d4e5f6" };
describe("PaperScreen pieces (R10.5, R10.6, R10.7, R9.8)", () => {
  it("for any T from 1 to 200 the view has ceil(T / 9) sheets, 'Page {p} of {N}' headers and T tiles", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 200 }), async (T) => {
        const { pages } = await buildPaperPages(src, fakeEncoder(T));
        const N = Math.ceil(T / 9);
        expect(pages).toHaveLength(N);
        const html = renderToStaticMarkup(<PaperView vm={toPaperVM({ size: "a4", fileTag: "f", previewIndex: 0, codesLine: "", session: "7F3A", hash: ["a", "b", "c"], pages, total: N })} />);
        expect(html.match(/<article class="paper/g)).toHaveLength(N);
        expect(html.match(/<figure class="tile">/g)).toHaveLength(T);
        for (let p = 1; p <= N; p++) expect(html).toContain(`Page ${p} of ${N}</p>`);
        expect(html).toContain(N === 1 ? "Print 1 page" : `Print ${N} pages`);
      }),
      { numRuns: 6 },
    );
  }, 120_000);
  it("the paper warning shows above 65,536 bytes and not at it; at the threshold T = 67 and N = 8", () => {
    expect(paperWarnIf(PAPER_WARN_BYTES, 67, 8)).toBeNull();
    expect(paperWarnIf(PAPER_WARN_BYTES + 1, 67, 8)).toEqual({ title: "Many pages", text: "This file needs 8 printed pages (67 codes). A smaller file needs fewer pages. You can also show it on screen instead." });
    const base = { size: "a4" as const, fileTag: "f", previewIndex: 0, codesLine: "", session: "7F3A", hash: ["a", "b", "c"] as [string, string, string], pages: [], total: 1 };
    expect(renderToStaticMarkup(<PaperView vm={toPaperVM({ ...base, warn: paperWarnIf(PAPER_WARN_BYTES + 1, 67, 8) })} />)).toMatch(/callout--warn[^>]*data-addition/);
    expect(renderToStaticMarkup(<PaperView vm={toPaperVM({ ...base, warn: paperWarnIf(PAPER_WARN_BYTES, 67, 8) })} />)).not.toContain("Many pages");
  });
  it("the print button calls window.print exactly once; PREV and NEXT stay in range", () => {
    let calls = 0;
    const r = reducePaper({ page: 1, N: 3 }, { t: "PRINT" });
    for (const fx of r.effects) if (fx === "PRINT") printPage({ print: () => void calls++ });
    expect(calls).toBe(1);
    expect(reducePaper({ page: 1, N: 3 }, { t: "PREV" }).state.page).toBe(1);
    expect(reducePaper({ page: 3, N: 3 }, { t: "NEXT" }).state.page).toBe(3);
    expect(reducePaper({ page: 2, N: 3 }, { t: "NEXT" }).state.page).toBe(3);
  });
});
