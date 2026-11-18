import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// The design export under design/project is source material (see .kiro/steering/design-handoff.md).
// strip.css is copied byte-identical into the app and never edited: its hash is pinned here.
const root = process.cwd();
const dir = join(root, "design/project");
const read = (f: string): string => readFileSync(join(dir, f), "utf8");
const sha256 = (f: string): string => createHash("sha256").update(readFileSync(join(dir, f))).digest("hex");
export const STRIP_CSS_SHA256 = "e8d66a6a098a6fa51fa3a6fe9ad01f2445e2a8400818e84192b142fbe8cd6d37";
const boards = readdirSync(dir).filter((f) => f.endsWith(".dc.html"));
describe("design export (steering: design-handoff)", () => {
  it("strip.css has the pinned SHA-256 (a new export means a new hash, deliberately)", () => {
    expect(sha256("strip.css")).toBe(STRIP_CSS_SHA256);
  });
  it("support.js, codegen.js, canvas.json and index.html are present", () => {
    for (const f of ["support.js", "codegen.js", "canvas.json", "index.html", "strip.css"]) expect(readdirSync(dir)).toContain(f);
    expect(boards.length).toBe(34);
  });
  it("every board is listed in canvas.json and nothing else is", () => {
    const canvas = JSON.parse(read("canvas.json")) as { boards: Record<string, unknown> };
    expect(Object.keys(canvas.boards).sort()).toEqual([...boards].sort());
  });
  it("no board has a style attribute, an inline style block or an inline event handler (strict CSP)", () => {
    for (const f of boards) {
      const t = read(f).replace(/<span class="t-mono">style=""<\/span>/g, ""); // Main.dc.html mentions the rule in prose
      expect(/\sstyle=["']/.test(t), `${f} style attribute`).toBe(false);
      expect(/<style[\s>]/.test(t), `${f} style block`).toBe(false);
      expect(/\son[a-z]+=["']/.test(t), `${f} inline handler`).toBe(false);
    }
  });
  it("the only external URLs in boards are the Google Fonts link (never shipped) and the repository link", () => {
    for (const f of boards) {
      const urls = (read(f).match(/https?:\/\/[^"'\s)<]+/g) ?? []).filter((u) => !u.startsWith("http://www.w3.org/"));
      for (const u of urls) {
        const ok = u.startsWith("https://fonts.googleapis.com/css2?family=IBM+Plex") || u === "https://github.com/alwayskumar-global/strip";
        expect(ok, `${f}: ${u}`).toBe(true);
      }
    }
  });
  it("strip.css has no @import, url() or external URL, and needs no inline style", () => {
    const css = read("strip.css");
    expect(/@import|url\(|https?:\/\//.test(css)).toBe(false);
  });
});
