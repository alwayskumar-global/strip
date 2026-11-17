// Static server for the built harness (apps/strip/dist/harness). It sends the Strip_CSP header on EVERY response
// (page, worker script, .wasm), sets Content-Type application/wasm for .wasm, and logs every request.
// Two listeners share one directory: PORT serves the real policy, ALT_PORT serves a policy without
// 'wasm-unsafe-eval' (the negative test). Run: node e2e-harness/server.mjs
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { STRIP_CSP } from "../src/csp.ts";

const root = resolve(process.env.HARNESS_DIR ?? "dist/harness");
const PORT = Number(process.env.PORT ?? 5180);
const ALT_PORT = Number(process.env.ALT_PORT ?? 5181);
const ALT_CSP = STRIP_CSP.replace(" 'wasm-unsafe-eval'", "");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
};
const log = [];

function listen(port, csp, label) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/__requests") {
      res.writeHead(200, { "Content-Type": "application/json", "Content-Security-Policy": csp });
      res.end(JSON.stringify(log));
      return;
    }
    if (url.pathname === "/__reset") {
      log.length = 0;
      res.writeHead(204, { "Content-Security-Policy": csp });
      res.end();
      return;
    }
    log.push({ server: label, method: req.method, url: req.url, host: req.headers.host, origin: req.headers.origin ?? null, referer: req.headers.referer ?? null });
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    const file = join(root, rel === "" ? "index.html" : rel);
    if (!file.startsWith(root)) {
      res.writeHead(403, { "Content-Security-Policy": csp });
      res.end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        "Content-Security-Policy": csp,
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch {
      res.writeHead(404, { "Content-Security-Policy": csp });
      res.end("not found");
    }
  });
  server.listen(port, "127.0.0.1");
}

listen(PORT, STRIP_CSP, "strip");
listen(ALT_PORT, ALT_CSP, "alt");
console.log(`harness: ${root} on ${PORT} (Strip_CSP) and ${ALT_PORT} (no wasm-unsafe-eval)`);
