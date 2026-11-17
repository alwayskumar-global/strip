// Page_Photo_Gate (R6.12, R6.13). Run with `pnpm test:measured`. Only the 92% batch is asserted (P36); the 75% batch is
// informational. One page is generated, decoded and released at a time (a 12 MP RGBA photo is 48 MB).
import { beforeAll, describe, expect, it } from "vitest";
import { decodeFrame } from "../../src/decode.js";
import { resetBackend } from "../../src/wasm-runtime.js";
import { makePage, photo } from "../../test/helpers/page-photo.js";
import { readerWasmBytes } from "../../test/helpers/wasm-bytes.js";
import { wilson } from "../../test/helpers/wilson.js";
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
beforeAll(() => resetBackend());
const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

async function batch(fill: number, pages: number, seed0: number) {
  let symbols = 0;
  let ge8 = 0;
  let all9 = 0;
  const ms: number[] = [];
  let ppm = 0;
  for (let n = 0; n < pages; n++) {
    const page = makePage(seed0 + n);
    const img = photo(page, seed0 + n, { fill });
    ppm = img.pixelsPerModule;
    const t0 = process.hrtime.bigint();
    const out = await decodeFrame(img, { wasm, maxSymbols: 9 });
    ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    const got = new Set<number>();
    if (out.kind === "found_many") for (const s of out.symbols) {
      const i = page.payloads.findIndex((p) => eq(p, s.bytes));
      if (i >= 0) got.add(i);
    }
    symbols += got.size;
    if (got.size >= 8) ge8++;
    if (got.size === 9) all9++;
  }
  ms.sort((a, b) => a - b);
  return { pages, ppm, symbols, ge8, all9, medianMs: ms[ms.length >> 1] as number, p95Ms: ms[Math.floor(ms.length * 0.95)] as number };
}
const report = (label: string, r: Awaited<ReturnType<typeof batch>>): void => {
  const w = wilson(r.ge8, r.pages);
  process.stdout.write(
    `[measured] ${label}: ${r.ppm.toFixed(2)} px/module, symbols read ${r.symbols}/${9 * r.pages} (${(r.symbols / (9 * r.pages)).toFixed(3)}), pages with >= 8 of 9: ${r.ge8}/${r.pages} wilson_lower=${w.lower.toFixed(3)}, pages with 9 of 9: ${r.all9}, decode median ${r.medianMs.toFixed(0)} ms p95 ${r.p95Ms.toFixed(0)} ms\n`,
  );
};

describe("Page_Photo_Gate", () => {
  // Feature: symbols, Property 36: Page_Photo_Gate, N = 100 pages, at least 8 of 9 symbols in a fraction of pages with a Wilson lower bound of at least 0.90, maxSymbols 9
  it("P36: N = 100 pages at 92% (about 5 px/module): at least 8 of 9 symbols, Wilson lower bound >= 0.90", async () => {
    const r = await batch(0.92, 100, 0);
    report("P36 page photos 12 MP, 3x3 v30 L, rotation <= 10 deg, perspective <= 4%, blur 1 px", r);
    process.stdout.write("[measured] spike baseline for this cell: 899/900 symbols, 100/100 pages with >= 8 of 9, 99 with 9 of 9, median 78 ms\n");
    // Global rule 14: a rate that differs from the spike beyond the Wilson interval is a stop-and-report event.
    expect(wilson(r.symbols, 900).upper, "symbols-read rate differs from the spike's 899/900 beyond the Wilson interval").toBeGreaterThanOrEqual(wilson(899, 900).lower);
    expect(wilson(r.ge8, 100).lower).toBeGreaterThanOrEqual(0.9);
  }, 3_600_000);
  it("R6.13 informational: N = 52 pages at 75% (about 4.1 px/module), no assertion", async () => {
    report("info page photos 12 MP at 75% of the height", await batch(0.75, 52, 1000));
  }, 3_600_000);
});
