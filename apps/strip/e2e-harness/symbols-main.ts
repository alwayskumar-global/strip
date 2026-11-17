// Harness for the symbols e2e tests: exposes the @strip/symbols barrel and the same-origin wasm source through
// window.__symbols. Only public entries are imported, as for any app.
import { wasmSource } from "../src/symbols-wasm.ts";
const violations: string[] = [];
document.addEventListener("securitypolicyviolation", (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));
const api = {
  wasmUrl: wasmSource.url,
  violations,
};
(window as unknown as { __symbols: typeof api }).__symbols = api;
