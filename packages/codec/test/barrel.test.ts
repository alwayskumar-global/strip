import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as barrel from "../src/index.js";

const RUNTIME = ["CodecError", "ERROR_CODES", "createDecoder", "decodePacket", "encode", "encodePacket", "parseMetadata", "serializeMetadata", "sha256WebCrypto"];
const TYPES = ["Decoder", "DecoderOptions", "EncodeOptions", "Encoder", "ErrorCode", "HashFn", "HashPrefixes", "IgnoreReason", "Limits", "Metadata", "PacketFields", "PayloadInput", "Progress", "PushStatus"];

describe("barrel (R9.1)", () => {
  it("exports exactly the nine runtime symbols", () => {
    expect(Object.keys(barrel).sort()).toEqual([...RUNTIME].sort());
  });

  it("exports exactly the fourteen type-only symbols and nothing else", () => {
    const root = process.cwd();
    const parsed = ts.getParsedCommandLineOfConfigFile(`${root}/tsconfig.json`, {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, "\n"));
      },
    });
    expect(parsed).toBeDefined();
    if (!parsed) return;
    const program = ts.createProgram({ rootNames: [`${root}/src/index.ts`], options: parsed.options });
    const checker = program.getTypeChecker();
    const source = program.getSourceFile(`${root}/src/index.ts`);
    expect(source).toBeDefined();
    if (!source) return;
    const moduleSymbol = checker.getSymbolAtLocation(source);
    expect(moduleSymbol).toBeDefined();
    if (!moduleSymbol) return;
    const all = checker.getExportsOfModule(moduleSymbol);
    const typeOnly: string[] = [];
    const values: string[] = [];
    for (const sym of all) {
      const target = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
      (target.flags & ts.SymbolFlags.Value ? values : typeOnly).push(sym.name);
    }
    expect(values.sort()).toEqual([...RUNTIME].sort());
    expect(typeOnly.sort()).toEqual([...TYPES].sort());
  });

  it("does not leak internals (overhead, soliton, neighbors, format, gauss) through the barrel", () => {
    for (const name of ["R", "lateCount", "coldLimit", "getSolitonTable", "Neighbors", "DEFAULT_FORMAT", "findPivots", "encodeWith", "createDecoderWith", "crc32", "Prng"]) {
      expect(name in barrel).toBe(false);
    }
  });

  it("the public API works end to end through the barrel only", async () => {
    const bytes = Uint8Array.from({ length: 5000 }, (_, i) => (i * 31 + 7) & 0xff);
    const enc = await barrel.encode({ bytes, name: "demo.bin", mime: "application/octet-stream" });
    const dec = barrel.createDecoder();
    for (let i = 0; i < enc.K; i++) await dec.push(enc.next());
    expect(dec.progress().complete).toBe(true);
    expect(dec.result().payload).toEqual(bytes);
    expect(barrel.ERROR_CODES).toHaveLength(10);
  });
});
