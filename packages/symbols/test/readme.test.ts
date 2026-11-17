import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");
describe("documentation (R14.6, R9.6, R6.7, R7.12)", () => {
  const readme = read("README.md");
  it("the first line states what the package does", () => {
    expect(readme.split("\n")[0]).toMatch(/^`@strip\/symbols` turns one codec packet into a QR code/);
  });
  it("R14.6: states the 70% rule and the defaults", () => {
    expect(readme).toMatch(/no more than about 70% of the short side of the camera frame/);
    expect(readme).toContain("version 30, ECC L, 1732-byte packet");
  });
  it("R9.6: states that the CSP is an HTTP header because frame-ancestors is ignored in a meta element", () => {
    expect(readme).toMatch(/HTTP response header/);
    expect(readme).toMatch(/`frame-ancestors` is ignored in a `<meta>` element/);
    expect(readme).toContain("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'");
  });
  it("documents the wasm-url subpath, the Latin-1 mapping and measured claims with N", () => {
    expect(readme).toContain("@strip/symbols/wasm-url");
    expect(readme).toMatch(/Latin-1/);
    expect(readme).toMatch(/\| 200 \|/);
  });
  it("the root README lists the prior art honestly and makes no novelty claim on the transport", () => {
    const root = read("../../README.md");
    expect(root.split("\n")[0]).toMatch(/^Strip turns any file/);
    for (const name of ["Decimen", "TXQR", "cimbar", "PaperBack", "qr-backup"]) expect(root).toContain(name);
    expect(root).toMatch(/not a claim of novelty/);
    expect(readme).toMatch(/claims nothing new in the transport/);
    expect(root.toLowerCase()).not.toMatch(/\b(novel|first-ever|world's first|revolutionary)\b/);
  });
  it("R6.7, R7.12: the device test checklist names what to show, which phones and what to record", () => {
    const d = read("../../docs/device-test.md");
    for (const h of ["## What to show or print", "## Phones", "## What to record", "## Conditions"]) expect(d).toContain(h);
    expect(d).toMatch(/5 decodes per second/);
    expect(d).toMatch(/mid-range/);
  });
  it("R16.14, R6.12: documents maxSymbols, found_many, skipped, and the N and method of the page-photo claim", () => {
    for (const s of ["maxSymbols", "found_many", "skipped", "FoundSymbol", "100 pages", "900/900", "Wilson lower bound 0.963", "docs/spikes/symbols-multi.md", "dependency D2"]) {
      expect(readme, s).toContain(s);
    }
    expect(readme).toMatch(/not_strip_packet.*only with `maxSymbols` 1/s);
  });
  it("R12.4: the barrel statement still lists the 11 runtime names and names FoundSymbol as type-only", () => {
    const names = ["encodeSymbol", "renderToCanvas", "renderToSvg", "fitScale", "decodeFrame", "createFrameDecoder", "SymbolError", "SYMBOL_ERROR_CODES", "QR_CAPACITY", "QR_CAPACITY_BY_VERSION", "QR_DEFAULTS"];
    const line = readme.split("\n").find((l) => l.startsWith("Public runtime exports:")) ?? "";
    for (const n of names) expect(line).toContain(`\`${n}\``);
    const listed = (line.split(". ")[0] ?? "").match(/`[A-Za-z_]+`/g) ?? [];
    expect(listed.length).toBe(11);
    expect(readme).toMatch(/`FoundSymbol` is a type-only export/);
  });
});
