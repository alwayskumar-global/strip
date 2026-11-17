// decodeFrame (R5) and the shared read logic used by the frame decoder (R7).
import type { BackendResult, Corners, DecoderBackend, ReaderOptions } from "./decoder-backend.js";
import { QR_CAPACITY } from "./capacity.js";
import type { DecodeMode, DecodeOptions, EccLevel, ImageDataLike, WasmSource } from "./types.js";
import { assertDecodeOptions, assertImageDataLike } from "./validate.js";
import { ensureBackend } from "./wasm-runtime.js";

export type FoundSymbol = { bytes: Uint8Array; version?: number; ecc?: EccLevel; corners?: Corners };

export type DecodeOutcome =
  | { kind: "found"; bytes: Uint8Array; version?: number; ecc?: EccLevel; corners?: Corners }
  | { kind: "found_many"; symbols: FoundSymbol[]; skipped: number }
  | { kind: "not_found" }
  | { kind: "not_strip_packet"; length: number }
  | { kind: "dropped" };

/** Exactly the options the spike measured; every budget was measured with them (R7.3). */
export const VIDEO_OPTIONS: ReaderOptions = Object.freeze({
  formats: ["QRCode"] as const,
  tryHarder: true,
  tryRotate: true,
  tryDownscale: true,
  tryInvert: false,
  maxNumberOfSymbols: 1,
  binarizer: "LocalAverage",
});
export const PHOTO_OPTIONS: ReaderOptions = Object.freeze({ ...VIDEO_OPTIONS, tryInvert: true });
export const PHOTO_RETRY_OPTIONS: ReaderOptions = Object.freeze({ ...PHOTO_OPTIONS, binarizer: "GlobalHistogram" });

/** Guarantees the bytes own their ArrayBuffer (R16.8), whatever the backend returned. */
const own = (b: Uint8Array): Uint8Array => (b.byteOffset === 0 && b.buffer.byteLength === b.length ? b : b.slice());

const toSymbol = (r: BackendResult): FoundSymbol => {
  const s: FoundSymbol = { bytes: own(r.bytes) };
  if (r.version !== undefined) s.version = r.version;
  if (r.ecc !== undefined) s.ecc = r.ecc;
  if (r.corners !== undefined) s.corners = r.corners;
  return s;
};

const toOutcome = (r: BackendResult): DecodeOutcome => {
  if (r.bytes.length > QR_CAPACITY.L) return { kind: "not_strip_packet", length: r.bytes.length };
  const out: DecodeOutcome = { kind: "found", bytes: r.bytes };
  if (r.version !== undefined) out.version = r.version;
  if (r.ecc !== undefined) out.ecc = r.ecc;
  if (r.corners !== undefined) out.corners = r.corners;
  return out;
};

const withMax = (o: ReaderOptions, maxSymbols: number): ReaderOptions => (maxSymbols === o.maxNumberOfSymbols ? o : { ...o, maxNumberOfSymbols: maxSymbols });

function toMany(results: BackendResult[]): DecodeOutcome {
  if (results.length === 0) return { kind: "not_found" };
  const symbols: FoundSymbol[] = [];
  let skipped = 0;
  for (const r of results) {
    if (r.bytes.length > QR_CAPACITY.L) skipped++;
    else symbols.push(toSymbol(r));
  }
  return { kind: "found_many", symbols, skipped };
}

/**
 * Reads one frame through the backend in the given mode. `photo` retries once with GlobalHistogram on a miss.
 * maxSymbols 1 (the default) keeps the single-symbol path and outcome shape; above 1 the reader returns every symbol
 * it finds up to that number and the outcome is found_many (R16).
 */
export async function readFrame(backend: DecoderBackend, frame: ImageDataLike, mode: DecodeMode, maxSymbols = 1): Promise<DecodeOutcome> {
  if (maxSymbols > 1) {
    const first = await backend.readMany(frame, withMax(mode === "photo" ? PHOTO_OPTIONS : VIDEO_OPTIONS, maxSymbols));
    if (first.length > 0) return toMany(first);
    if (mode === "photo") return toMany(await backend.readMany(frame, withMax(PHOTO_RETRY_OPTIONS, maxSymbols)));
    return { kind: "not_found" };
  }
  const first = await backend.read(frame, mode === "photo" ? PHOTO_OPTIONS : VIDEO_OPTIONS);
  if (first !== undefined) return toOutcome(first);
  if (mode === "photo") {
    const retry = await backend.read(frame, PHOTO_RETRY_OPTIONS);
    if (retry !== undefined) return toOutcome(retry);
  }
  return { kind: "not_found" };
}

export type BackendProvider = (src: WasmSource | undefined) => Promise<DecoderBackend>;

/** decodeFrame with an injected backend provider. Internal: not part of the barrel. */
export async function decodeFrameWith(provider: BackendProvider, frame: ImageDataLike, options: DecodeOptions): Promise<DecodeOutcome> {
  assertImageDataLike(frame);
  assertDecodeOptions(options);
  const backend = await provider(options.wasm);
  return readFrame(backend, frame, options.mode ?? "video", options.maxSymbols ?? 1);
}

export function decodeFrame(frame: ImageDataLike, options: DecodeOptions): Promise<DecodeOutcome> {
  return decodeFrameWith(ensureBackend, frame, options);
}
