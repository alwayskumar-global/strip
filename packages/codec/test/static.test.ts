import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("static checks", () => {
  it("R9.4: src compiles with zero errors under lib ES2023 with no DOM and no Node types", () => {
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

  it("R9.6, R9.7: package.json has no dependencies key", () => {
    const pkg = JSON.parse(readFileSync(`${root}/package.json`, "utf8")) as Record<string, unknown>;
    expect("dependencies" in pkg).toBe(false);
  });
});
