import { readFileSync } from "node:fs";
/** The reader .wasm shipped by zxing-wasm, read from disk (tests only; src never touches the file system). */
export function readerWasmBytes(): Uint8Array {
  return readFileSync(`${process.cwd()}/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm`);
}
