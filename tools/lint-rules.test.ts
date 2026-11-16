import { describe, expect, it } from "vitest";
import { ESLint } from "eslint";

// Runs from the repo root (pnpm test:tools). ESLint resolves config by virtual file path.
const eslint = new ESLint({ cwd: process.cwd() });

async function ruleIds(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? "parse-error");
}

const CODEC = "packages/codec/src/x.ts";
const SYMBOLS = "packages/symbols/src/x.ts";
const APP = "apps/strip/src/x.ts";
const CLOCK = "apps/strip/src/clock/x.ts";
const IMPORTS = "no-restricted-imports";
const PROPS = "no-restricted-properties";

describe("purity bans", () => {
  const calls = ["Math.random()", "Date.now()", "performance.now()"];
  for (const call of calls) {
    for (const file of [CODEC, SYMBOLS, APP]) {
      it(`${call} fails in ${file}`, async () => {
        expect(await ruleIds(file, `export const v = ${call};\n`)).toContain(PROPS);
      });
    }
    it(`${call} passes in apps/strip/src/clock`, async () => {
      expect(await ruleIds(CLOCK, `export const v = ${call};\n`)).not.toContain(PROPS);
    });
  }
});

describe("package boundaries", () => {
  const imp = (spec: string) => `import ${JSON.stringify(spec)};\n`;

  it("codec may not import any workspace package", async () => {
    for (const s of ["@strip/symbols", "@strip/codec", "@strip/app"]) {
      expect(await ruleIds(CODEC, imp(s))).toContain(IMPORTS);
    }
  });
  it("codec may import its own relative modules", async () => {
    expect(await ruleIds(CODEC, imp("./other"))).not.toContain(IMPORTS);
  });
  it("symbols may import @strip/codec only", async () => {
    expect(await ruleIds(SYMBOLS, imp("@strip/codec"))).not.toContain(IMPORTS);
    expect(await ruleIds(SYMBOLS, imp("@strip/app"))).toContain(IMPORTS);
  });
  it("app may import the two package barrels only", async () => {
    expect(await ruleIds(APP, imp("@strip/codec"))).not.toContain(IMPORTS);
    expect(await ruleIds(APP, imp("@strip/symbols"))).not.toContain(IMPORTS);
  });
  it("deep imports into package internals fail everywhere", async () => {
    for (const file of [SYMBOLS, APP]) {
      expect(await ruleIds(file, imp("@strip/codec/src/index"))).toContain(IMPORTS);
      expect(await ruleIds(file, imp("@strip/codec/src/internal/crc"))).toContain(IMPORTS);
    }
  });
  it("relative paths into another package fail", async () => {
    expect(await ruleIds(SYMBOLS, imp("../../../packages/codec/src/index"))).toContain(IMPORTS);
    expect(await ruleIds(APP, imp("../../../packages/codec/src/index"))).toContain(IMPORTS);
    expect(await ruleIds(APP, imp("../../../../packages/symbols/src/crc"))).toContain(IMPORTS);
  });
  it("boundary rules also apply under apps/strip/src/clock", async () => {
    expect(await ruleIds(CLOCK, imp("@strip/codec/src/index"))).toContain(IMPORTS);
  });
});
