// decodeFrame (R5) and the shared read logic used by the frame decoder (R7).
import type { BackendResult, Corners, DecoderBackend, ReaderOptions } from "./decoder-backend.js";
import { QR_CAPACITY } from "./capacity.js";
import type { DecodeMode, DecodeOptions, EccLevel, ImageDataLike, WasmSource } from "./types.js";
import { assertDecodeOptions, assertImageDataLike } from "./validate.js";
import { ensureBackend } from "./wasm-runtime.js";

export type DecodeOutcome =
  | { kind: "found"; bytes: Uint8Array; version?: number; ecc?: EccLevel; corners?: Corners }
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

const toOutcome = (r: BackendResult): DecodeOutcome => {
  if (r.bytes.length > QR_CAPACITY.L) return { kind: "not_strip_packet", length: r.bytes.length };
  const out: DecodeOutcome = { kind: "found", bytes: r.bytes };
  if (r.version !== undefined) out.version = r.version;
  if (r.ecc !== undefined) out.ecc = r.ecc;
  if (r.corners !== undefined) out.corners = r.corners;
  return out;
};

/** Reads one frame through the backend in the given mode. `photo` retries once with GlobalHistogram on a miss. */
export async function readFrame(backend: DecoderBackend, frame: ImageDataLike, mode: DecodeMode): Promise<DecodeOutcome> {
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
  return readFrame(backend, frame, options.mode ?? "video");
}

export function decodeFrame(frame: ImageDataLike, options: DecodeOptions): Promise<DecodeOutcome> {
  return decodeFrameWith(ensureBackend, frame, options);
}
