import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
// Task 1.4 (R19.1, R19.2, R19.5, R19.8, R19.9; P37, P38): shipped stylesheet and fonts.
const root = process.cwd();
const STRIP_CSS_SHA256 = "e8d66a6a098a6fa51fa3a6fe9ad01f2445e2a8400818e84192b142fbe8cd6d37"; // same pin as tools/design.test.ts, checked below
const app = join(root, "apps/strip");
const bytes = (p: string): Buffer => readFileSync(join(root, p));
const text = (p: string): string => readFileSync(join(root, p), "utf8");
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

const FONT_FILES = ["IBMPlexSans-Regular", "IBMPlexSans-Medium", "IBMPlexSans-SemiBold", "IBMPlexMono-Regular", "IBMPlexMono-Medium", "IBMPlexMono-SemiBold"].map((n) => `${n}.woff2`);
const TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

function woff2Tables(file: Buffer): Map<string, Buffer> {
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let p = 48;
  const dir: Array<{ tag: string; length: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file[p++] as number;
    const idx = flags & 0x3f;
    let tag: string;
    if (idx === 63) {
      tag = file.subarray(p, p + 4).toString("latin1");
      p += 4;
    } else tag = TAGS[idx] as string;
    const version = flags >> 6;
    const base128 = (): number => {
      let v = 0;
      for (let k = 0; k < 5; k++) {
        const b = file[p++] as number;
        v = v * 128 + (b & 0x7f);
        if ((b & 0x80) === 0) break;
      }
      return v;
    };
    const orig = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    dir.push({ tag, length: transformed ? base128() : orig });
  }
  const data = brotliDecompressSync(file.subarray(p, p + compressedSize));
  const out = new Map<string, Buffer>();
  let off = 0;
  for (const d of dir) {
    out.set(d.tag, data.subarray(off, off + d.length));
    off += d.length;
  }
  return out;
}
function cmapCodepoints(cmap: Buffer): Set<number> {
  const set = new Set<number>();
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const o = cmap.readUInt32BE(4 + i * 8 + 4);
    const fmt = cmap.readUInt16BE(o);
    if (fmt === 4) {
      const segX2 = cmap.readUInt16BE(o + 6);
      const endO = o + 14;
      const startO = endO + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(endO + s * 2);
        const start = cmap.readUInt16BE(startO + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end; c++) set.add(c);
      }
    } else if (fmt === 12) {
      const groups = cmap.readUInt32BE(o + 12);
      for (let g = 0; g < groups; g++) {
        const s = cmap.readUInt32BE(o + 16 + g * 12);
        const e = cmap.readUInt32BE(o + 20 + g * 12);
        for (let c = s; c <= e; c++) set.add(c);
      }
    }
  }
  return set;
}
function gsubFeatureTags(gsub: Buffer): Set<string> {
  const fl = gsub.readUInt16BE(6);
  const count = gsub.readUInt16BE(fl);
  const tags = new Set<string>();
  for (let i = 0; i < count; i++) tags.add(gsub.subarray(fl + 2 + i * 6, fl + 6 + i * 6).toString("latin1"));
  return tags;
}
const fonts = new Map(FONT_FILES.map((f) => [f, woff2Tables(bytes(`apps/strip/public/fonts/${f}`))]));

function files(dir: string, pred: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, pred));
    else if (pred(name)) out.push(p);
  }
  return out;
}

describe("shipped stylesheet (P37, R19.2)", () => {
  it("apps/strip/src/styles/strip.css has the pinned SHA-256 and equals design/project/strip.css byte for byte", () => {
    const shipped = bytes("apps/strip/src/styles/strip.css");
    expect(sha(shipped)).toBe(STRIP_CSS_SHA256);
    expect(text("tools/design.test.ts")).toContain(STRIP_CSS_SHA256);
    expect(shipped.equals(bytes("design/project/strip.css"))).toBe(true);
  });
  it("fonts.css holds exactly the six @font-face rules, swap, same-origin /fonts/ woff2 URLs and nothing else", () => {
    const css = text("apps/strip/src/styles/fonts.css").replace(/\/\*[^]*?\*\//g, "");
    const rules = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];
    expect(rules).toHaveLength(6);
    expect(css.replace(/@font-face\s*\{[^}]*\}/g, "").trim()).toBe("");
    const seen = new Set<string>();
    for (const r of rules) {
      expect(r).toContain("font-display: swap");
      const url = /url\("(\/fonts\/[A-Za-z]+-[A-Za-z]+\.woff2)"\)/.exec(r)?.[1];
      expect(url, r).toBeDefined();
      expect(FONT_FILES).toContain((url as string).slice("/fonts/".length));
      seen.add(url as string);
    }
    expect(seen.size).toBe(6);
    expect(css).not.toMatch(/https?:|\/\/|@import/);
  });
  it("strip-additions.css has only the three R19.8 rules: .paper--off (screen), .vf video/canvas, #diag", () => {
    const css = text("apps/strip/src/styles/strip-additions.css").replace(/\/\*[^]*?\*\//g, "");
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => (m[1] as string).replace(/\s+/g, " ").trim());
    expect(selectors).toEqual(["@media screen", ".paper--off", ".vf video, .vf canvas", "#diag"]);
    expect(css).not.toMatch(/\bbody\b|ring|stroke-dasharray|@import|url\(/);
  });
  it("index.html links the three stylesheets in order, with no inline style and no external host", () => {
    const html = text("apps/strip/index.html");
    const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/src/styles/strip.css", "/src/styles/fonts.css", "/src/styles/strip-additions.css"]);
    expect(html).not.toMatch(/<style|style=|https?:\/\//);
  });
});

describe("template syntax and design runtime never reach src (P38, R19.1, R19.5)", () => {
  const banned = ["{{", "sc-for", "sc-if", "dc-import", "x-dc", "<helmet", "data-dc-script", "hint-", "fonts.googleapis.com", "codegen", "support.js", ".dc.html"];
  // The href map is the one place that must name the board files and the Google Fonts link it maps away from.
  const allowed = new Map<string, string[]>([["state/href-map.ts", [".dc.html", "fonts.googleapis.com"]]]);
  it("no file under apps/strip/src contains a banned construct", () => {
    const src = join(app, "src");
    const hits: string[] = [];
    for (const f of files(src, (n) => /\.(ts|tsx|css|html)$/.test(n))) {
      const rel = f.slice(src.length + 1);
      if (/\.test\.tsx?$/.test(rel)) continue; // tests may name what they forbid
      const t = readFileSync(f, "utf8");
      for (const b of banned) if (t.includes(b) && !(allowed.get(rel) ?? []).includes(b)) hits.push(`${rel}: ${b}`);
    }
    expect(hits).toEqual([]);
  });
  it("the shipped public directory and index.html name no external font host", () => {
    for (const f of [...files(join(app, "public"), (n) => /\.(css|html|js|json|webmanifest)$/.test(n)), join(app, "index.html")]) {
      expect(readFileSync(f, "utf8"), f).not.toContain("fonts.googleapis.com");
    }
  });
});

describe("self-hosted fonts (R19.9, steering: design-handoff)", () => {
  it("public/fonts holds the six woff2 files, the OFL text, and nothing else", () => {
    expect(readdirSync(join(app, "public/fonts")).sort()).toEqual([...FONT_FILES, "OFL.txt"].sort());
    const ofl = text("apps/strip/public/fonts/OFL.txt");
    expect(ofl).toContain("Copyright © 2017 IBM Corp.");
    expect(ofl).toContain("SIL OPEN FONT LICENSE Version 1.1");
  });
  it("each shipped file is the one recorded in docs/dependencies.md (size and SHA-256)", () => {
    const doc = text("docs/dependencies.md");
    let total = 0;
    for (const f of FONT_FILES) {
      const b = bytes(`apps/strip/public/fonts/${f}`);
      total += b.length;
      expect(doc, f).toContain(`| ${f} | ${b.length} | ${sha(b)} |`);
    }
    expect(doc).toContain(`Total shipped: ${total.toLocaleString("en-US")} bytes.`);
    expect(total).toBeLessThan(80_000);
  });
  it("THIRD_PARTY_NOTICES names both fonts with version and licence and carries the OFL text and copyright", () => {
    const n = text("apps/strip/public/THIRD_PARTY_NOTICES");
    expect(n).toMatch(/IBM Plex Sans \(@ibm\/plex-sans 1\.1\.0\)\s+SIL OFL 1\.1/);
    expect(n).toMatch(/IBM Plex Mono \(@ibm\/plex-mono 2\.5\.0\)\s+SIL OFL 1\.1/);
    expect(n).toContain("Copyright © 2017 IBM Corp. with Reserved Font Name \"Plex\"");
    expect(n).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(n).toContain(text("apps/strip/public/fonts/OFL.txt").trim());
  });
  it("each font keeps the slashed-zero ('zero') feature the boards use", () => {
    for (const [f, t] of fonts) expect(gsubFeatureTags(t.get("GSUB") as Buffer).has("zero"), f).toBe(true);
  });
  it("glyph coverage: Basic Latin, Latin-1 and the listed characters are in all six fonts", () => {
    const need = new Set<number>();
    for (let c = 0x20; c <= 0x7e; c++) need.add(c);
    for (let c = 0xa0; c <= 0xff; c++) need.add(c);
    for (const ch of "≈≠×·…’–→←—“”›") need.add(ch.codePointAt(0) as number);
    for (const [f, t] of fonts) {
      const have = cmapCodepoints(t.get("cmap") as Buffer);
      const missing = [...need].filter((c) => !have.has(c)).map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`);
      expect(missing, f).toEqual([]);
    }
  });
  it("no tofu: every character of every board, the codec messages and the app source is covered", () => {
    const chars = new Set<string>();
    const add = (t: string): void => {
      for (const ch of t) if (ch !== "\n" && ch !== "\t" && ch !== "\r") chars.add(ch);
    };
    const boardDir = join(root, "design/project");
    for (const f of readdirSync(boardDir).filter((n) => n.endsWith(".dc.html"))) add(readFileSync(join(boardDir, f), "utf8"));
    for (const dir of ["packages/codec/src", "apps/strip/src"]) for (const f of files(join(root, dir), (n) => /\.(ts|tsx)$/.test(n))) if (!/\.test\.tsx?$/.test(f)) add(readFileSync(f, "utf8"));
    expect(chars.size).toBeGreaterThan(60);
    for (const [f, t] of fonts) {
      const have = cmapCodepoints(t.get("cmap") as Buffer);
      const missing = [...chars].filter((ch) => !have.has(ch.codePointAt(0) as number)).map((ch) => `U+${(ch.codePointAt(0) as number).toString(16).toUpperCase().padStart(4, "0")}`);
      expect(missing, f).toEqual([]);
    }
  });
  it("the font directory is not empty on disk", () => {
    expect(existsSync(join(app, "public/fonts/IBMPlexSans-Regular.woff2"))).toBe(true);
  });
});
