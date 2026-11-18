// Image_Intake: one image at a time, refused before decoding when too large or too many, scaled to at most 4096 px on the
// long side, then given to the decode worker as an ImageBitmap (R9.9, R12.10 to R12.13). No <img>, no blob URL.
import { scaleOf } from "../state/image-rules.js";
import { IMAGE_LONG_SIDE } from "../limits.js";
import { createDecodeClient, type DecodeClient, type WorkerLike } from "../workers/decode-client.js";
import { wasmSource } from "../workers/symbols-wasm.js";
export class ImageReadError extends Error {
  constructor() {
    super("the browser cannot open this file as an image");
    this.name = "ImageReadError";
  }
}
/** Decodes the file to a bitmap, scaled so the long side is at most IMAGE_LONG_SIDE. Throws ImageReadError. */
export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new ImageReadError();
  }
  const s = scaleOf(bmp.width, bmp.height);
  if (!s.scaled) return bmp;
  try {
    const small = await createImageBitmap(bmp, { resizeWidth: s.width, resizeHeight: s.height, resizeQuality: "high" });
    return small;
  } catch {
    throw new ImageReadError();
  } finally {
    bmp.close();
  }
}
/** The worker-backed decoder for photos: photo mode, up to 9 symbols per image, images up to 4096 x 4096. */
export function createImageDecoder(): DecodeClient {
  const worker = new Worker(new URL("../workers/decode.worker.ts", import.meta.url), { type: "module" });
  return createDecodeClient(worker as unknown as WorkerLike, { wasmUrl: wasmSource.url, maxWidth: IMAGE_LONG_SIDE, maxHeight: IMAGE_LONG_SIDE, mode: "photo", maxSymbols: 9 });
}
