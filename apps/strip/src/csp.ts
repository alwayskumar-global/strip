// The Strip_CSP: the single source of the policy string (R9.3, R9.7). Used by the Vite dev and preview servers, the
// e2e harness server and the documented host configuration. Deliver it as an HTTP response header on EVERY response
// (page, worker script, .wasm). worker-src is explicit: the decode worker is a same-origin file, never a blob: URL; frame-ancestors is ignored in a <meta> element, so the header is the only delivery (R9.6).
export const STRIP_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
