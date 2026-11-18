import { readFileSync, readdirSync, statSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
const root = process.cwd(); // packages/symbols
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const srcFiles = walk(`${root}/src`).filter((p) => p.endsWith(".ts"));
const read = (p: string) => readFileSync(p, "utf8");
const importSpecs = (code: string): string[] =>
  [...code.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)].map((m) => m[1] as string);
const base = (p: string) => p.slice(p.lastIndexOf("/") + 1);
describe("static checks (symbols)", () => {
  it("R10.4: src compiles with zero errors under lib ES2023 with no DOM and no Node types", () => {
    const config = ts.getParsedCommandLineOfConfigFile(`${root}/tsconfig.json`, {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    });
    expect(config).toBeDefined();
    if (!config) return;
    expect(config.options.lib?.map((l) => l.toLowerCase())).toEqual(["lib.es2023.d.ts"]);
    expect(config.options.types).toEqual([]);
    const program = ts.createProgram({ rootNames: config.fileNames, options: config.options });
    const diagnostics = ts.getPreEmitDiagnostics(program).map((d) =>
      ts.flattenDiagnosticMessageText(d.messageText, "\n"),
    );
    expect(diagnostics).toEqual([]);
    expect(config.fileNames.length).toBeGreaterThan(0);
  });
  it("R11.4: zxing-wasm is imported only as zxing-wasm/reader and only by zxing-backend.ts", () => {
    for (const p of srcFiles) {
      for (const s of importSpecs(read(p)).filter((s) => s.startsWith("zxing-wasm"))) {
        const ok = base(p) === "zxing-backend.ts" && s === "zxing-wasm/reader";
        const wasmUrl = base(p) === "wasm-url.ts" && s === "zxing-wasm/reader/zxing_reader.wasm?url";
        expect(ok || wasmUrl, `${p} imports ${s}`).toBe(true);
      }
    }
  });
  it("R11.5: qr is imported only by qr-encoder.ts, and its decoder entry never", () => {
    for (const p of srcFiles) {
      for (const s of importSpecs(read(p)).filter((s) => s === "qr" || s.startsWith("qr/"))) {
        expect(base(p) === "qr-encoder.ts" && s === "qr", `${p} imports ${s}`).toBe(true);
      }
    }
  });
  it("R10.4: only wasm-url.ts contains an asset-URL import, and no src file imports wasm-url", () => {
    for (const p of srcFiles) {
      const specs = importSpecs(read(p));
      if (base(p) !== "wasm-url.ts") expect(specs.filter((s) => s.endsWith("?url")), p).toEqual([]);
      expect(specs.filter((s) => /(^|\/)wasm-url(\.[cm]?[jt]s)?$/.test(s)), p).toEqual([]);
    }
  });
  it("R1.11: every @strip/codec import in src is type-only", () => {
    for (const p of srcFiles) {
      for (const line of read(p).split("\n")) {
        if (/from\s+["']@strip\/codec["']/.test(line) || /import\s+["']@strip\/codec["']/.test(line)) {
          expect(/^\s*import\s+type\s/.test(line) || /^\s*export\s+type\s/.test(line), `${p}: ${line}`).toBe(true);
        }
      }
    }
  });
  it("R12.3: package exports has exactly the entries . and ./wasm-url", () => {
    const pkg = JSON.parse(read(`${root}/package.json`)) as { exports: Record<string, string> };
    expect(pkg.exports).toEqual({ ".": "./src/index.ts", "./wasm-url": "./src/wasm-url.ts" });
  });
  it("R11.8: apps/strip/package.json has no qr or zxing-wasm entry", () => {
    const pkg = JSON.parse(read(`${root}/../../apps/strip/package.json`)) as Record<string, Record<string, string> | undefined>;
    for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      const names = Object.keys(pkg[key] ?? {});
      expect(names, key).not.toContain("qr");
      expect(names, key).not.toContain("zxing-wasm");
    }
  });
  it("R10.1: src has no Math.random, Date.now, performance.now, fetch, document or window", () => {
    const banned = /\b(Math\.random|Date\.now|performance\.now|fetch|document|window)\b/;
    for (const p of srcFiles) {
      const code = read(p)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, ""))
        .join("\n");
      expect(banned.test(code), p).toBe(false);
    }
  });
});
describe("import graph (R10.4, R12.3)", () => {
  it("src/index.ts does not reach wasm-url.ts through relative imports", () => {
    const seen = new Set<string>();
    const visit = (file: string): void => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const s of importSpecs(read(file)).filter((s) => s.startsWith("."))) {
        const dir = file.slice(0, file.lastIndexOf("/"));
        const target = `${dir}/${s.replace(/\.js$/, ".ts")}`.replace(/\/\.\//g, "/");
        visit(target);
      }
    };
    visit(`${root}/src/index.ts`);
    expect([...seen].map(base)).not.toContain("wasm-url.ts");
    expect(seen.size).toBeGreaterThan(5);
  });
});
describe("worker boundaries (R7.10, R10.4)", () => {
  it("the decode worker has no asset-URL import, and frame-decoder.ts has no postMessage or self", () => {
    const worker = read(`${root}/../../apps/strip/src/workers/decode.worker.ts`);
    expect(importSpecs(worker).filter((s) => s.endsWith("?url"))).toEqual([]);
    const fd = read(`${root}/src/frame-decoder.ts`).replace(/\/\/.*$/gm, "");
    expect(/\bpostMessage\b/.test(fd)).toBe(false);
    expect(/\bself\b/.test(fd)).toBe(false);
  });
});
