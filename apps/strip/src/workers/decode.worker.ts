// Dedicated module worker that owns the Frame_Decoder. It has no asset-URL import: the .wasm URL arrives in `init`.
import { createFrameDecoder, SymbolError } from "@strip/symbols";
import type { FrameDecoder, ImageDataLike } from "@strip/symbols";
import { transferListOf } from "./transfer-list.ts";
import type { Channel, ChannelConfig, FromWorker, ToWorker } from "./decode-protocol.ts";

type Scope = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((e: { data: unknown }) => void) | null;
};
const scope = self as unknown as Scope;
const post = (m: FromWorker, transfer: Transferable[] = []): void => scope.postMessage(m, transfer);
const codeOf = (e: unknown) => (e instanceof SymbolError ? e.code : "UNSUPPORTED_ENVIRONMENT");
let decoder: FrameDecoder | undefined;
let canvas: OffscreenCanvas | undefined;

async function frameFromBitmap(bitmap: ImageBitmap): Promise<ImageDataLike> {
  canvas ??= new OffscreenCanvas(bitmap.width, bitmap.height);
  if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) throw new SymbolError("UNSUPPORTED_ENVIRONMENT", "no 2d context on OffscreenCanvas");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: d.width, height: d.height, data: d.data };
}

let imageDecoder: FrameDecoder | undefined;
let imageConfig: ChannelConfig | undefined;
let wasmUrl = "";
async function decoderFor(channel: Channel): Promise<FrameDecoder> {
  if (channel === "camera") {
    if (decoder === undefined) throw new SymbolError("INVALID_INPUT", "decoder is not initialised");
    return decoder;
  }
  // The image decoder (4096 x 4096 staging, 67 MB) is created at the first image and disposed on release.
  if (imageDecoder === undefined) {
    if (imageConfig === undefined) throw new SymbolError("INVALID_INPUT", "no image channel configured");
    imageDecoder = await createFrameDecoder({ wasm: { kind: "url", url: wasmUrl }, maxWidth: imageConfig.maxWidth, maxHeight: imageConfig.maxHeight, mode: imageConfig.mode, ...(imageConfig.maxSymbols === undefined ? {} : { maxSymbols: imageConfig.maxSymbols }) });
  }
  return imageDecoder;
}
scope.onmessage = async (e) => {
  const msg = e.data as ToWorker;
  if (msg.type === "init") {
    try {
      wasmUrl = msg.wasmUrl;
      imageConfig = msg.image;
      decoder = await createFrameDecoder({ wasm: { kind: "url", url: msg.wasmUrl }, maxWidth: msg.maxWidth, maxHeight: msg.maxHeight, mode: msg.mode, ...(msg.maxSymbols === undefined ? {} : { maxSymbols: msg.maxSymbols }) });
      post({ type: "ready" });
    } catch (err) {
      post({ type: "init-error", code: codeOf(err), message: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (msg.type === "release") {
    imageDecoder?.dispose();
    imageDecoder = undefined;
    return;
  }
  const id = msg.id;
  try {
    const d = await decoderFor(msg.type === "bitmap" ? (msg.channel ?? "camera") : "camera");
    const frame: ImageDataLike =
      msg.type === "frame" ? { width: msg.width, height: msg.height, data: new Uint8ClampedArray(msg.buffer) } : await frameFromBitmap(msg.bitmap);
    const outcome = await d.submit(frame);
    post({ type: "outcome", id, outcome }, transferListOf(outcome));
  } catch (err) {
    post({ type: "error", id, code: codeOf(err), message: err instanceof Error ? err.message : String(err) });
  }
};
