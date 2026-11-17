import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as barrel from "../src/index.js";
const root = process.cwd();
const RUNTIME = ["QR_CAPACITY", "QR_CAPACITY_BY_VERSION", "QR_DEFAULTS", "SYMBOL_ERROR_CODES", "SymbolError", "createFrameDecoder", "decodeFrame", "encodeSymbol", "fitScale", "renderToCanvas", "renderToSvg"];
describe("barrel (R12, R11.7)", () => {
  it("R12.1: the runtime export list is exactly the 11 names, and readerWasmUrl is not among them", () => {
    expect(Object.keys(barrel).sort()).toEqual([...RUNTIME].sort());
    expect(Object.keys(barrel)).not.toContain("readerWasmUrl");
    expect(Object.keys(barrel).length).toBe(11);
  });
  it("R12.2: the type-only export list is checked by a compile-time test file included in typecheck", () => {
    const f = readFileSync(`${root}/test/types/barrel-types.ts`, "utf8");
    for (const t of ["SymbolMatrix", "EccLevel", "EncodeOptions", "RenderOptions", "DecodeOptions", "WasmSource", "DecodeOutcome", "FrameDecoder", "SymbolErrorCode"]) {
      expect(f).toContain(t);
    }
    expect(JSON.parse(readFileSync(`${root}/tsconfig.test.json`, "utf8")).include).toContain("test");
  });
  it("R12.3: package exports has exactly . and ./wasm-url", () => {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as { exports: Record<string, string> };
    expect(Object.keys(pkg.exports)).toEqual([".", "./wasm-url"]);
  });
  it("R11.7: the emitted declarations contain no import from qr or zxing-wasm", () => {
    const cfg = ts.getParsedCommandLineOfConfigFile(`${root}/tsconfig.json`, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined });
    expect(cfg).toBeDefined();
    if (!cfg) return;
    const program = ts.createProgram({
      rootNames: [`${root}/src/index.ts`], // only what the barrel reaches (wasm-url is a separate subpath)
      options: { ...cfg.options, declaration: true, emitDeclarationOnly: true, noEmit: false },
    });
    const emitted: Record<string, string> = {};
    program.emit(undefined, (name, text) => {
      emitted[name] = text;
    });
    const names = Object.keys(emitted);
    expect(names.length).toBeGreaterThan(10);
    const idx = names.find((n) => n.endsWith("src/index.d.ts"));
    expect(idx).toBeDefined();
    for (const [n, text] of Object.entries(emitted)) {
      expect(/from\s+["'](qr|zxing-wasm)[^"']*["']/.test(text), n).toBe(false);
      expect(/import\(["'](qr|zxing-wasm)/.test(text), n).toBe(false);
    }
    expect(readdirSync(`${root}/src`).length).toBeGreaterThan(10);
  });
  // Feature: symbols, Property 17: the runtime export list of the barrel equals exactly the 11 names of R12.1 and does not include readerWasmUrl, package exports has exactly the entries . and ./wasm-url, and no export type or value comes from qr or zxing-wasm
  it("P17: no export type or value comes from qr or zxing-wasm", () => {
    const src = readFileSync(`${root}/src/index.ts`, "utf8");
    expect(/from\s+["'](qr|zxing-wasm)/.test(src)).toBe(false);
    expect(/from\s+["']\.\/(qr-encoder|zxing-backend|wasm-url|wasm-runtime)/.test(src)).toBe(false);
    expect(Object.keys(barrel).sort()).toEqual([...RUNTIME].sort());
  });
});
