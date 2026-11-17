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
function missingRows(rows: Map<string, unknown>): string[] {
  return declared()
    .filter((d) => !d.spec.startsWith("workspace:") && !rows.has(d.name))
    .map((d) => d.name);
}
function srcFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? srcFiles(`${dir}/${e.name}`) : e.name.endsWith(".ts") ? [`${dir}/${e.name}`] : [],
  );
}
describe("symbols dependencies (R11.1 to R11.4)", () => {
  const symbols = () => JSON.parse(read("packages/symbols/package.json")) as Pkg;
  it("lists exactly qr 0.7.2, zxing-wasm 3.1.7 and the workspace link to @strip/codec, with no range", () => {
    expect(symbols().dependencies).toEqual({ "@strip/codec": "workspace:*", qr: "0.7.2", "zxing-wasm": "3.1.7" });
    expect(symbols().devDependencies).toBeUndefined();
    for (const spec of Object.values(symbols().dependencies ?? {})) expect(spec).not.toMatch(/^[\^~]/);
  });
  it("has a logged row for both runtime dependencies with the same exact version", () => {
    const rows = loggedRows();
    expect(rows.get("qr")?.version).toBe("0.7.2");
    expect(rows.get("zxing-wasm")?.version).toBe("3.1.7");
    expect(rows.get("qr")?.license).toContain("MIT");
    expect(rows.get("zxing-wasm")?.license).toBe("MIT");
  });
  it("mutation: removing a logged row, or adding an unlogged dependency, would fail the row check", () => {
    expect(missingRows(loggedRows())).toEqual([]);
    const without = loggedRows();
    without.delete("qr");
    expect(missingRows(without)).toEqual(["qr"]);
    const none = new Map<string, unknown>();
    expect(missingRows(none).sort()).toContain("zxing-wasm");
  });
  it("the apps declare neither qr nor zxing-wasm (R11.8)", () => {
    const app = JSON.parse(read("apps/strip/package.json")) as Pkg;
    for (const n of ["qr", "zxing-wasm"]) expect(Object.keys(app.dependencies ?? {})).not.toContain(n);
  });
  it("the writer and full builds of zxing-wasm are not imported anywhere in src (packages and app)", () => {
    for (const f of [...srcFiles("packages/symbols/src"), ...srcFiles("apps/strip/src"), ...srcFiles("apps/strip/e2e-harness")]) {
      const code = read(f);
      expect(/from\s+["']zxing-wasm(\/full|\/writer)/.test(code), f).toBe(false);
      expect(/from\s+["']zxing-wasm["']/.test(code), f).toBe(false);
      expect(/zxing_(full|writer)/.test(code), f).toBe(false);
    }
  });
});
