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
    expect(readme).toContain("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'");
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
});
