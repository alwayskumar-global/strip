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
describe("symbols import rules (R1.11, R10.4, R11.4, R11.5)", () => {
  const f = (name: string) => `packages/symbols/src/${name}`;
  const imp = (spec: string) => `import ${JSON.stringify(spec)};\n`;
  const ruleIdsFor = (name: string, code: string) => ruleIds(f(name), code);
  it("qr is allowed only in qr-encoder.ts, and its decoder entry never", async () => {
    expect(await ruleIdsFor("qr-encoder.ts", imp("qr"))).not.toContain(IMPORTS);
    expect(await ruleIdsFor("qr-encoder.ts", imp("qr/decode.js"))).toContain(IMPORTS);
    expect(await ruleIdsFor("encode-symbol.ts", imp("qr"))).toContain(IMPORTS);
  });
  it("zxing-wasm/reader is allowed only in zxing-backend.ts", async () => {
    expect(await ruleIdsFor("zxing-backend.ts", imp("zxing-wasm/reader"))).not.toContain(IMPORTS);
    for (const s of ["zxing-wasm", "zxing-wasm/full", "zxing-wasm/writer"]) {
      expect(await ruleIdsFor("zxing-backend.ts", imp(s))).toContain(IMPORTS);
    }
    expect(await ruleIdsFor("decode.ts", imp("zxing-wasm/reader"))).toContain(IMPORTS);
  });
  it("asset-URL imports are allowed only in wasm-url.ts", async () => {
    const wasm = "zxing-wasm/reader/zxing_reader.wasm?url";
    expect(await ruleIdsFor("wasm-url.ts", imp(wasm))).not.toContain(IMPORTS);
    expect(await ruleIdsFor("decode.ts", imp(wasm))).toContain(IMPORTS);
    expect(await ruleIdsFor("decode.ts", imp("./x.png?url"))).toContain(IMPORTS);
  });
  it("no src file imports wasm-url.ts", async () => {
    for (const s of ["./wasm-url", "./wasm-url.ts", "./wasm-url.js"]) {
      expect(await ruleIdsFor("index.ts", imp(s))).toContain(IMPORTS);
    }
  });
  it("@strip/codec is type-only", async () => {
    const ids = (code: string) => ruleIdsFor("capacity.ts", code);
    expect(await ids(`import type { Packet } from "@strip/codec";\nexport type P = Packet;\n`)).not.toContain(
      "@typescript-eslint/no-restricted-imports",
    );
    expect(await ids(`import { encode } from "@strip/codec";\nexport const e = encode;\n`)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });
});
describe("app may import the documented symbols subpath only (R12.3)", () => {
  const imp = (spec: string) => `import ${JSON.stringify(spec)};\n`;
  it("@strip/symbols/wasm-url is allowed, other deep paths are not", async () => {
    expect(await ruleIds(APP, imp("@strip/symbols/wasm-url"))).not.toContain(IMPORTS);
    expect(await ruleIds(APP, imp("@strip/symbols/src/decode"))).toContain(IMPORTS);
    expect(await ruleIds(APP, imp("@strip/codec/src/packet"))).toContain(IMPORTS);
  });
});
