import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Task 4.6 (R22.7): the README only cites pnpm scripts that exist, and keeps its required statements.
const root = process.cwd();
const readme = readFileSync(join(root, "README.md"), "utf8");
const scripts = new Map<string, Set<string>>();
for (const p of ["package.json", ...["packages", "apps"].flatMap((d) => readdirSync(join(root, d)).map((n) => `${d}/${n}/package.json`))]) {
  if (!existsSync(join(root, p))) continue;
  const j = JSON.parse(readFileSync(join(root, p), "utf8")) as { name?: string; scripts?: Record<string, string> };
  scripts.set(p === "package.json" ? "root" : (j.name as string), new Set(Object.keys(j.scripts ?? {})));
}
describe("README (R22.7)", () => {
  it("names only pnpm scripts that exist in a package.json", () => {
    const cited = [...readme.matchAll(/^\s*pnpm (?:--filter (\S+) )?([\w:.-]+)/gm), ...readme.matchAll(/`pnpm (?:--filter (\S+) )?([\w:.-]+)[^`]*`/g)];
    expect(cited.length).toBeGreaterThan(6);
    for (const m of cited) {
      const filter = m[1];
      const name = m[2] as string;
      if (["install", "exec"].includes(name)) continue;
      expect(scripts.get(filter ?? "root")?.has(name), `pnpm ${filter ? `--filter ${filter} ` : ""}${name}`).toBe(true);
    }
  });
  it("starts with what Strip does, leads with the print-first story, then the screen mode", () => {
    expect(readme.split("\n")[0]).toBe("Strip turns any file into a printable strip or an animated on-screen code sequence that a phone camera reads back, entirely in the browser.");
    expect(readme.indexOf("Softstrip")).toBeGreaterThan(-1);
    expect(readme.indexOf("Softstrip")).toBeLessThan(readme.indexOf("screen mode"));
  });
  it("keeps the prior-art section with no novelty claim on the transport, and the exact disclosure paragraph", () => {
    expect(readme).toContain("## Prior art");
    expect(readme).toContain("This is not a new idea, and the transport is not a claim of novelty.");
    for (const n of ["Decimen Optical Transfer", "TXQR", "cimbar", "PaperBack", "qr-backup", "Cauzin Softstrip"]) expect(readme).toContain(n);
    expect(readme).toContain("Visual design was produced outside Kiro with Claude Design. The HTML exports in design/ are the source markup that Kiro converted into the application's components. All application code in this repository was written in Kiro.");
  });
  it("has the measured-claims tables with their sample sizes and the known limits", () => {
    for (const s of ["M1 late join", "M2 cold start", "M3 page mode", "N = 1000", "200/200", "900/900", "untested on real phones", "maxGaussianBlocks", "256 KB"]) expect(readme, s).toContain(s);
  });
  it("points to .kiro/ (specs, steering, hooks) and docs/dependencies.md, and every linked file exists", () => {
    for (const s of [".kiro/", "specs/", "steering/", "hooks/", "docs/dependencies.md"]) expect(readme).toContain(s);
    for (const m of readme.matchAll(/\]\(([^)#]+)\)/g)) expect(existsSync(join(root, m[1] as string)), m[1]).toBe(true);
  });
});
