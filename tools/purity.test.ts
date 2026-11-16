import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), ".kiro/hooks/scripts/purity.mjs");
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function run(files: Record<string, string>): { status: number; stderr: string } {
  const root = mkdtempSync(join(tmpdir(), "purity-"));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, content);
  }
  mkdirSync(join(root, "packages"), { recursive: true });
  try {
    execFileSync("node", [script], { cwd: root, stdio: "pipe" });
    return { status: 0, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stderr?: Buffer };
    return { status: err.status ?? -1, stderr: String(err.stderr ?? "") };
  }
}

describe("purity script", () => {
  it("passes on clean sources", () => {
    expect(run({ "packages/codec/src/a.ts": "export const a = 1 + 1;\n" }).status).toBe(0);
  });

  it("bans the three original symbols in every package", () => {
    for (const pkg of ["codec", "symbols"]) {
      for (const sym of ["Math.random()", "Date.now()", "performance.now()"]) {
        const r = run({ [`packages/${pkg}/src/a.ts`]: `export const a = ${sym};\n` });
        expect(r.status, `${pkg} ${sym}`).toBe(1);
        expect(r.stderr).toContain(`packages/${pkg}/src/a.ts:1`);
      }
    }
  });

  it("bans Math.log, Math.sqrt, Math.exp and Math.pow in packages/codec/src", () => {
    for (const sym of ["Math.log(2)", "Math.sqrt(2)", "Math.exp(1)", "Math.pow(2, 3)"]) {
      const r = run({ "packages/codec/src/deep/a.ts": `export const a = ${sym};\n` });
      expect(r.status, sym).toBe(1);
      expect(r.stderr).toContain("packages/codec/src/deep/a.ts:1");
    }
  });

  it("does not ban those four in other packages", () => {
    for (const sym of ["Math.log(2)", "Math.sqrt(2)", "Math.exp(1)", "Math.pow(2, 3)"]) {
      expect(run({ "packages/symbols/src/a.ts": `export const a = ${sym};\n` }).status, sym).toBe(0);
    }
  });

  it("does not flag look-alikes such as Math.log2 or Math.floor", () => {
    expect(run({ "packages/codec/src/a.ts": "export const a = Math.log2(8) + Math.floor(1.5);\n" }).status).toBe(0);
  });

  it("ignores files outside src", () => {
    expect(run({ "packages/codec/test/a.ts": "export const a = Math.log(2) + Math.random();\n" }).status).toBe(0);
  });
});
