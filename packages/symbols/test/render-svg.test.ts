import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { encodeSymbol } from "../src/encode-symbol.js";
import { SymbolError } from "../src/errors.js";
import { renderToSvg } from "../src/render-svg.js";
const sym = (v = 3, n = 10) => encodeSymbol(Uint8Array.from({ length: n }, (_, i) => i * 13 + 1), { version: v });
describe("renderToSvg", () => {
  it("R4.1: viewBox is 0 0 W W with W = size + 2 * quietZone", () => {
    const m = sym();
    expect(renderToSvg(m, { ppm: 1 })).toContain(`viewBox="0 0 ${m.size + 8} ${m.size + 8}"`);
    expect(renderToSvg(m, { ppm: 1, quietZone: 6 })).toContain(`viewBox="0 0 ${m.size + 12} ${m.size + 12}"`);
  });
  it("R4.2: crispEdges present and the dark modules are one path", () => {
    const s = renderToSvg(sym(), { ppm: 1 });
    expect(s).toContain('shape-rendering="crispEdges"');
    expect(s.match(/<path /g)?.length).toBe(1);
  });
  it("R4.3: mm sets width and height in mm, otherwise neither appears", () => {
    expect(renderToSvg(sym(), { ppm: 1, mm: 40 })).toContain('width="40mm" height="40mm"');
    const s = renderToSvg(sym(), { ppm: 1 });
    expect(s).not.toMatch(/ width=".*mm"/);
    expect(s.match(/<svg[^>]*>/)?.[0]).not.toContain("width=");
  });
  it("R4.4: colours appear only as fill attributes, and unsafe colour strings throw INVALID_INPUT", () => {
    const s = renderToSvg(sym(), { ppm: 1, dark: "#102030", light: "white" });
    expect(s).toContain('fill="#102030"');
    expect(s).toContain('fill="white"');
    expect(s).not.toContain("style");
    for (const bad of ['"><script>', "red\"", "url(#a)", "<b>", "javascript:", "href"]) {
      expect(() => renderToSvg(sym(), { ppm: 1, dark: bad })).toThrow(SymbolError);
    }
  });
  it("R4.1, R4.2: the path parsed back to runs covers exactly the dark modules", () => {
    const m = sym(7, 80);
    const qz = 4;
    const d = /d="([^"]*)"/.exec(renderToSvg(m, { ppm: 1 }))?.[1] ?? "";
    const got = new Set<number>();
    for (const r of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)) {
      expect(r[3]).toBe(r[4]);
      for (let i = 0; i < Number(r[3]); i++) got.add(Number(r[2]) * 1000 + Number(r[1]) + i);
    }
    const want = new Set<number>();
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.modules[y * m.size + x]) want.add((y + qz) * 1000 + x + qz);
    expect(got).toEqual(want);
  });
  // Feature: symbols, Property 8: for any matrix and options, the SVG string has no <script, <style, style=, on\w+=, href, url( or data:, has crispEdges and a module-unit viewBox, and has mm width and height iff mm is given
  it("P8: SVG is free of script, style, handlers and references", () => {
    const colour = fc.constantFrom("#000", "#ffffff", "#12ab34", "red", "navy", "transparent");
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 4, max: 10 }), fc.option(fc.integer({ min: 1, max: 500 }), { nil: undefined }), colour, colour, fc.integer({ min: 1, max: 40 }), (v, qz, mm, dark, light, ppm) => {
        const m = sym(v, 1);
        const s = renderToSvg(m, { ppm, quietZone: qz, ...(mm === undefined ? {} : { mm }), dark, light });
        expect(s).not.toMatch(/<script|<style|style=|on\w+=|href|url\(|data:/i);
        expect(s).toContain('shape-rendering="crispEdges"');
        const w = m.size + 2 * qz;
        expect(s).toContain(`viewBox="0 0 ${w} ${w}"`);
        expect(/<svg[^>]* width="/.test(s)).toBe(mm !== undefined);
        expect(/<svg[^>]* height="/.test(s)).toBe(mm !== undefined);
      }),
      { numRuns: 100 },
    );
  });
});
