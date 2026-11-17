// createFrameDecoder (R7): single-flight decoding with a reused staging buffer. Environment-agnostic: no worker or
// message-passing code lives here (the app owns the worker).
import { readFrame } from "./decode.js";
import type { BackendProvider, DecodeOutcome } from "./decode.js";
import { SymbolError } from "./errors.js";
import type { DecodeOptions, ImageDataLike } from "./types.js";
import { assertDecodeOptions, assertImageDataLike } from "./validate.js";
import { ensureBackend } from "./wasm-runtime.js";

export type FrameDecoderOptions = DecodeOptions & { maxWidth: number; maxHeight: number };

export interface FrameDecoder {
  /** Resolves `dropped` at once while a decode is in flight; the frame is not queued. */
  submit(frame: ImageDataLike): Promise<DecodeOutcome>;
  readonly busy: boolean;
  dispose(): void;
}

const bad = (message: string): never => {
  throw new SymbolError("INVALID_INPUT", message);
};

/** createFrameDecoder with an injected backend provider. Internal: not part of the barrel. */
export async function createFrameDecoderWith(provider: BackendProvider, options: FrameDecoderOptions): Promise<FrameDecoder> {
  assertDecodeOptions(options);
  const { maxWidth, maxHeight } = options as { maxWidth: unknown; maxHeight: unknown };
  if (!Number.isInteger(maxWidth) || (maxWidth as number) < 1) bad("maxWidth must be an integer >= 1");
  if (!Number.isInteger(maxHeight) || (maxHeight as number) < 1) bad("maxHeight must be an integer >= 1");
  const mw = maxWidth as number;
  const mh = maxHeight as number;
  const mode = options.mode ?? "video";
  const maxSymbols = options.maxSymbols ?? 1;
  const backend = await provider(options.wasm);
  const staging = new Uint8ClampedArray(mw * mh * 4);
  let busy = false;
  let disposed = false;
  return {
    get busy() {
      return busy;
    },
    async submit(frame) {
      if (disposed) return bad("the frame decoder was disposed");
      assertImageDataLike(frame);
      if (frame.width > mw || frame.height > mh) return bad(`frame ${frame.width}x${frame.height} exceeds the maximum ${mw}x${mh}`);
      if (busy) return { kind: "dropped" };
      busy = true;
      try {
        staging.set(frame.data);
        const view: ImageDataLike = { width: frame.width, height: frame.height, data: staging.subarray(0, frame.data.length) };
        return await readFrame(backend, view, mode, maxSymbols);
      } finally {
        busy = false;
      }
    },
    dispose() {
      disposed = true;
    },
  };
}

export function createFrameDecoder(options: FrameDecoderOptions): Promise<FrameDecoder> {
  return createFrameDecoderWith(ensureBackend, options);
}
