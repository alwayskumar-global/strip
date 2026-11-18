import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
// P40 (R7.1, R19.11, R20.7): the production build has no gallery; the gallery build has it; no built file names a board.
const app = join(process.cwd(), "apps/strip");
const SENTINEL = "STRIP_GALLERY_SENTINEL_7f3a";
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const textFiles = (dir: string): Array<{ name: string; text: string }> =>
  files(dir).filter((f) => /\.(js|css|html|json|mjs)$/.test(f)).map((f) => ({ name: f.slice(dir.length + 1), text: readFileSync(f, "utf8") }));
beforeAll(async () => {
  process.env["NODE_ENV"] = "production"; // vitest sets "test", which would build React in development mode
  for (const mode of ["production", "gallery"]) await build({ root: app, mode, logLevel: "silent", configFile: join(app, "vite.config.ts") });
}, 240_000);
describe("gallery exclusion (P40)", () => {
  it("the production build has no gallery chunk, sentinel, gallery route string, page--m or fs--m", () => {
    const out = join(app, "dist/app");
    expect(existsSync(join(out, "index.html"))).toBe(true);
    const all = textFiles(out);
    expect(all.length).toBeGreaterThan(1);
    for (const f of all) {
      expect(f.text, f.name).not.toContain(SENTINEL);
      expect(f.text, f.name).not.toContain("__gallery");
      if (f.name.endsWith(".js")) {
        // strip.css legitimately has the selectors; no script may add the classes
        expect(f.text, f.name).not.toContain("page--m");
        expect(f.text, f.name).not.toContain("fs--m");
      }
      expect(f.name, "gallery chunk file").not.toMatch(/gallery/i);
    }
  });
  it("the gallery build contains the sentinel and the gallery routes", () => {
    const all = textFiles(join(app, "dist/gallery"));
    expect(all.some((f) => f.text.includes(SENTINEL))).toBe(true);
    expect(all.some((f) => f.text.includes("symbol-specimens"))).toBe(true);
  });
  it("no built file of either build contains .dc.html", () => {
    for (const dir of ["dist/app", "dist/gallery"]) for (const f of textFiles(join(app, dir))) expect(f.text, `${dir}/${f.name}`).not.toContain(".dc.html");
  });
  it("the built index.html has no inline script, style element, style attribute or event handler (R15.9)", () => {
    for (const dir of ["dist/app", "dist/gallery"]) {
      const html = readFileSync(join(app, dir, "index.html"), "utf8");
      expect(html, dir).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);
      expect(html, dir).not.toMatch(/<style|\sstyle=|\son[a-z]+=/);
    }
  });
});
