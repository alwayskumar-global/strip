// Message protocol between the main thread and the decode worker (design: Frame-decoder API, app side).
import type { DecodeMode, DecodeOutcome, SymbolErrorCode } from "@strip/symbols";

export type ToWorker =
  | { type: "init"; wasmUrl: string; maxWidth: number; maxHeight: number; mode: DecodeMode }
  | { type: "frame"; id: number; width: number; height: number; buffer: ArrayBuffer }
  | { type: "bitmap"; id: number; bitmap: ImageBitmap };

export type FromWorker =
  | { type: "ready" }
  | { type: "init-error"; code: SymbolErrorCode; message: string }
  | { type: "outcome"; id: number; outcome: DecodeOutcome }
  | { type: "error"; id: number; code: SymbolErrorCode; message: string };
