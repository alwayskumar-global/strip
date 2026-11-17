// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- lets a consuming app program see the "*?url" declaration
/// <reference path="./vite-url.d.ts" />
// The Wasm_URL_Module (R12.3). The only file with an asset-URL import (R10.4). Exposed as the package subpath
// "@strip/symbols/wasm-url", never imported by the barrel or by any other src file. Vite resolves the import from
// this package, where zxing-wasm is a dependency, so apps/strip needs no zxing-wasm dependency (R11.8).
import readerWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
export { readerWasmUrl };
