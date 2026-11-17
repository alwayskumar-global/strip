// Compile-time check (R12.2): the type-only exports of the barrel exist and have the documented shape.
// Covered by `pnpm typecheck` (tsconfig.test.json includes test/).
import type {
  Canvas2DLike,
  FoundSymbol,
  DecodeOptions,
  DecodeOutcome,
  EccLevel,
  EncodeOptions,
  FrameDecoder,
  RenderOptions,
  SymbolErrorCode,
  SymbolMatrix,
  WasmSource,
} from "../../src/index.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<T extends true>(): T | undefined {
  return undefined;
}

assertType<Equal<EccLevel, "L" | "M" | "Q" | "H">>();
assertType<Equal<SymbolErrorCode, "INVALID_INPUT" | "PACKET_TOO_LARGE" | "ENCODE_FAILED" | "UNSUPPORTED_ENVIRONMENT">>();
assertType<Equal<Extract<DecodeOutcome, { kind: "not_found" }>, { kind: "not_found" }>>();
assertType<Equal<Extract<WasmSource, { kind: "url" }>["url"], string>>();
export type Used = [SymbolMatrix, EncodeOptions, RenderOptions, DecodeOptions, FrameDecoder, Canvas2DLike];

// Multi-symbol decoding (R12.4, R16): FoundSymbol is type-only, DecodeOutcome has found_many, DecodeOptions has maxSymbols.
assertType<Equal<Extract<DecodeOutcome, { kind: "found_many" }>["symbols"], FoundSymbol[]>>();
assertType<Equal<Extract<DecodeOutcome, { kind: "found_many" }>["skipped"], number>>();
assertType<Equal<DecodeOptions["maxSymbols"], number | undefined>>();
export type UsedMulti = FoundSymbol;
