// The only file that imports zxing-wasm (R11.4): the reader entry only. Reads `result.bytes`, never `result.text` (R5.6).
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import type { BackendResult, DecoderBackend, ReaderOptions } from "./decoder-backend.js";
import type { WasmSource } from "./types.js";

function toArrayBuffer(b: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (b instanceof ArrayBuffer) return b;
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return copy.buffer;
}

/**
 * Initialises the reader module from the given source and returns a backend. Never leaves the library's default
 * CDN location in place: `locateFile` or `wasmBinary` is always overridden (R5.8, R9.2).
 */
export async function loadZxingBackend(src: WasmSource): Promise<DecoderBackend> {
  const overrides =
    src.kind === "url"
      ? { locateFile: (path: string): string => (path.endsWith(".wasm") ? src.url : path) }
      : { wasmBinary: toArrayBuffer(src.bytes) };
  await prepareZXingModule({ overrides, fireImmediately: true });
  return {
    async read(frame, options: ReaderOptions) {
      const results = await readBarcodes(
        // The library duck-types { width, height, data } (checked in zxing-wasm 3.1.7), so no ImageData is needed.
        { width: frame.width, height: frame.height, data: frame.data } as unknown as Parameters<typeof readBarcodes>[0],
        { ...options, formats: [...options.formats] },
      );
      const r = results.find((x) => x.isValid);
      if (r === undefined) return undefined;
      const out: { -readonly [K in keyof BackendResult]: BackendResult[K] } = { bytes: r.bytes.slice() };
      const version = Number.parseInt(r.version, 10);
      if (Number.isInteger(version) && version >= 1 && version <= 40) out.version = version;
      if (r.ecLevel === "L" || r.ecLevel === "M" || r.ecLevel === "Q" || r.ecLevel === "H") out.ecc = r.ecLevel;
      const p = r.position;
      if (p) out.corners = [p.topLeft, p.topRight, p.bottomRight, p.bottomLeft];
      return out;
    },
  };
}
