// Public barrel for @strip/symbols (R12.1). Depends on @strip/codec types only. The only other public entry is the
// package subpath "@strip/symbols/wasm-url".
export { QR_CAPACITY, QR_CAPACITY_BY_VERSION, QR_DEFAULTS } from "./capacity.js";
export type { CapacityRow, SymbolDefaults } from "./capacity.js";
export { createFrameDecoder } from "./frame-decoder.js";
export type { FrameDecoder, FrameDecoderOptions } from "./frame-decoder.js";
export { decodeFrame } from "./decode.js";
export type { DecodeOutcome, FoundSymbol } from "./decode.js";
export type { Corners, Point } from "./decoder-backend.js";
export { encodeSymbol } from "./encode-symbol.js";
export { SYMBOL_ERROR_CODES, SymbolError } from "./errors.js";
export type { SymbolErrorCode } from "./errors.js";
export { fitScale } from "./fit-scale.js";
export type { FitBox, FitResult } from "./fit-scale.js";
export type { SymbolMatrix } from "./matrix.js";
export { renderToCanvas } from "./render-canvas.js";
export type { Canvas2DLike } from "./render-canvas.js";
export { renderToSvg } from "./render-svg.js";
export type { DecodeMode, DecodeOptions, EccLevel, EncodeOptions, ImageDataLike, RenderOptions, WasmSource } from "./types.js";
