// Once-per-page initialisation of the decoder backend, memoised by source (R5.7, R5.8, R8.5).
import type { DecoderBackend } from "./decoder-backend.js";
import { SymbolError } from "./errors.js";
import type { WasmSource } from "./types.js";
import { loadZxingBackend } from "./zxing-backend.js";

export type BackendLoader = (src: WasmSource) => Promise<DecoderBackend>;

let current: { src: WasmSource; promise: Promise<DecoderBackend> } | undefined;

const sameSource = (a: WasmSource, b: WasmSource): boolean =>
  a.kind === "url" ? b.kind === "url" && a.url === b.url : b.kind === "bytes" && a.bytes === b.bytes;

/**
 * Returns the backend for `src`, initialising it on the first call. A missing source throws INVALID_INPUT and
 * nothing is fetched. A different source after a successful init is rejected with INVALID_INPUT, because the reader
 * module keeps global state. A failed init is forgotten, so a later call may retry.
 */
export function ensureBackend(src: WasmSource | undefined, loader: BackendLoader = loadZxingBackend): Promise<DecoderBackend> {
  if (src === undefined) {
    return Promise.reject(new SymbolError("INVALID_INPUT", "a wasm source is required; no default location is used"));
  }
  if (current !== undefined) {
    if (sameSource(current.src, src)) return current.promise;
    return Promise.reject(new SymbolError("INVALID_INPUT", "the reader wasm was already initialised from a different source"));
  }
  const entry = {
    src,
    promise: loader(src).catch((e: unknown) => {
      if (current === entry) current = undefined;
      throw new SymbolError("UNSUPPORTED_ENVIRONMENT", `reader wasm failed to load: ${e instanceof Error ? e.message : String(e)}`);
    }),
  };
  current = entry;
  return entry.promise;
}

/** Forgets the initialised backend. Test support and `dispose` use only. */
export function resetBackend(): void {
  current = undefined;
}
