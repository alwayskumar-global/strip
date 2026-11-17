import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every dependency of every workspace package must be exact-pinned and logged in docs/dependencies.md.
const root = process.cwd();
const read = (p: string): string => readFileSync(join(root, p), "utf8");

interface Pkg {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

function manifests(): Array<{ path: string; pkg: Pkg }> {
  const paths = ["package.json"];
  for (const dir of ["packages", "apps"]) for (const name of readdirSync(join(root, dir))) paths.push(`${dir}/${name}/package.json`);
  const out: Array<{ path: string; pkg: Pkg }> = [];
  for (const p of paths) {
    try {
      out.push({ path: p, pkg: JSON.parse(read(p)) as Pkg });
    } catch {
      /* directory without package.json */
    }
  }
  return out;
}

const EXACT = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

function loggedRows(): Map<string, { version: string; license: string; reason: string }> {
  const rows = new Map<string, { version: string; license: string; reason: string }>();
  for (const line of read("docs/dependencies.md").split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 6 || cells[0] !== "" || cells[1] === "name" || /^-+$/.test(cells[1] as string)) continue;
    rows.set(cells[1] as string, { version: cells[2] as string, license: cells[3] as string, reason: cells[4] as string });
  }
  return rows;
}

function declared(): Array<{ path: string; field: string; name: string; spec: string }> {
  const out: Array<{ path: string; field: string; name: string; spec: string }> = [];
  for (const { path, pkg } of manifests()) {
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
      for (const [name, spec] of Object.entries(pkg[field] ?? {})) out.push({ path, field, name, spec });
    }
  }
  return out;
}

describe("dependency log consistency (R9.6, R9.7)", () => {
  it("finds the root, the codec, symbols and the app manifests", () => {
    expect(manifests().map((m) => m.path).sort()).toEqual(["apps/strip/package.json", "package.json", "packages/codec/package.json", "packages/symbols/package.json"]);
  });

  it("every dependency is exact-pinned (workspace links excepted)", () => {
    for (const d of declared()) {
      if (d.spec.startsWith("workspace:")) continue;
      expect(EXACT.test(d.spec), `${d.path} ${d.field} ${d.name}@${d.spec} must be an exact version`).toBe(true);
    }
  });

  it("every external dependency has a row in docs/dependencies.md with the same exact version", () => {
    const rows = loggedRows();
    expect(rows.size).toBeGreaterThan(0);
    for (const d of declared()) {
      if (d.spec.startsWith("workspace:")) continue;
      const row = rows.get(d.name);
      expect(row, `docs/dependencies.md has no row for ${d.name} (declared in ${d.path})`).toBeDefined();
      expect(row?.version, `${d.name} version in docs/dependencies.md`).toBe(d.spec);
      expect(row?.license.length, `${d.name} needs a license`).toBeGreaterThan(0);
      expect(row?.reason.length, `${d.name} needs a reason`).toBeGreaterThan(0);
    }
  });

  it("no logged row is for a package that is not declared anywhere", () => {
    const names = new Set(declared().map((d) => d.name));
    for (const name of loggedRows().keys()) expect(names.has(name), `${name} is logged but not declared`).toBe(true);
  });

  it("packages/codec declares no dependencies key at all", () => {
    const codec = JSON.parse(read("packages/codec/package.json")) as Record<string, unknown>;
    expect("dependencies" in codec).toBe(false);
    expect("peerDependencies" in codec).toBe(false);
  });

  it("the workspace links only follow the allowed direction (codec <- symbols <- app)", () => {
    const find = (p: string) => manifests().find((m) => m.path === p)?.pkg;
    expect(Object.keys(find("packages/codec/package.json")?.dependencies ?? {})).toEqual([]);
    expect(Object.keys(find("packages/symbols/package.json")?.dependencies ?? {}).filter((n) => n.startsWith("@strip/"))).toEqual(["@strip/codec"]);
    expect(Object.keys(find("apps/strip/package.json")?.dependencies ?? {}).filter((n) => n.startsWith("@strip/")).sort()).toEqual(["@strip/codec", "@strip/symbols"]);
  });
});
