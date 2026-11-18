// Message protocol between the main thread and the decode worker (design: Frame-decoder API, app side).
import type { DecodeMode, DecodeOutcome, SymbolErrorCode } from "@strip/symbols";

export type Channel = "camera" | "image";
export type ChannelConfig = { maxWidth: number; maxHeight: number; mode: DecodeMode; maxSymbols?: number };
// `channel` defaults to "camera", so the existing harness keeps working. The image decoder is created lazily at the first image.
export type ToWorker =
  | { type: "init"; wasmUrl: string; maxWidth: number; maxHeight: number; mode: DecodeMode; maxSymbols?: number; image?: ChannelConfig }
  | { type: "frame"; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: "bitmap"; id: number; bitmap: ImageBitmap; channel?: Channel }
  | { type: "release"; channel: "image" };

export type FromWorker =
  | { type: "ready" }
  | { type: "init-error"; code: SymbolErrorCode; message: string }
  | { type: "outcome"; id: number; outcome: DecodeOutcome }
  | { type: "error"; id: number; code: SymbolErrorCode; message: string };
