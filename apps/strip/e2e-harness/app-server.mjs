// Three static servers for the app and the fidelity gate. Run: node e2e-harness/app-server.mjs
//   5182  dist/app      (production build), SPA fallback for dot-less paths, SECURITY_HEADERS
//   5183  dist/gallery  (Harness_Build with /__gallery/* routes), same fallback, SECURITY_HEADERS
//   5185  dist/app routed exactly as vercel.json says: its header rules (merged, in file order), the static files first, then its rewrites
//   5184  baseline: design/project as is, /__fonts/<file>.woff2 from public/fonts, and virtual wrapper boards
//         /__w-ReceiveState-<phase>.dc.html and /__w-ErrorState-<kind>.dc.html. No headers: support.js is not under the App CSP.
// A missing dist directory answers 503 (the baseline server never needs a build).
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SECURITY_HEADERS } from "../src/csp.ts";
const here = fileURLToPath(new URL(".", import.meta.url));
const appRoot = resolve(here, "..");
const designRoot = resolve(appRoot, "../../design/project");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
};
const typeOf = (file) => (file.endsWith("THIRD_PARTY_NOTICES") ? TYPES[".txt"] : (TYPES[extname(file)] ?? "application/octet-stream"));
const FONTS_LINK = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap";
/** Wrapper board: the design runtime renders one component instance, alone. Mirrors the shell of Receive.dc.html. */
export function wrapper(name, attr, value, width, height) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${name} ${value}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="strip.css">
<script src="codegen.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="${FONTS_LINK}" rel="stylesheet">
</helmet>
<dc-import name="${name}" ${attr}="${value}"></dc-import>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${width},"height":${height}}}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>
`;
}
const WRAP = /^\/__w-(ReceiveState|ErrorState)-([a-z]+)\.dc\.html$/;
const log = [];
function serve(port, label, handler, headers) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/__requests") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(log));
      return;
    }
    if (url.pathname === "/__reset") {
      log.length = 0;
      res.writeHead(204);
      res.end();
      return;
    }
    log.push({ server: label, method: req.method, url: req.url });
    const out = await handler(decodeURIComponent(url.pathname));
    const extra = typeof headers === "function" ? headers(decodeURIComponent(url.pathname)) : headers;
    res.writeHead(out.status, { "Content-Type": out.type ?? "text/plain; charset=utf-8", "Cache-Control": "no-store", ...extra });
    res.end(out.body ?? "");
  });
  server.listen(port, "127.0.0.1");
  return server;
}
async function readUnder(root, rel) {
  const file = join(root, normalize(rel).replace(/^([/\\])+/, ""));
  if (!file.startsWith(root)) return { status: 403 };
  try {
    return { status: 200, body: await readFile(file), type: typeOf(file) };
  } catch {
    return { status: 404, body: "not found" };
  }
}
function spaServer(dir) {
  const root = resolve(appRoot, dir);
  return async (path) => {
    const hit = await readUnder(root, path === "/" ? "/index.html" : path);
    if (hit.status === 404 && !/\.[A-Za-z0-9]+$/.test(path)) {
      const index = await readUnder(root, "/index.html");
      if (index.status === 404) return { status: 503, body: `${dir} is not built` };
      return index;
    }
    return hit;
  };
}
async function baseline(path) {
  const m = WRAP.exec(path);
  if (m) {
    const receive = m[1] === "ReceiveState";
    const html = wrapper(m[1], receive ? "phase" : "kind", m[2], receive ? 390 : 420, receive ? 860 : 620);
    return { status: 200, body: html, type: TYPES[".html"] };
  }
  if (path.startsWith("/__fonts/")) return readUnder(join(appRoot, "public/fonts"), path.slice("/__fonts/".length));
  return readUnder(designRoot, path === "/" ? "/Home.dc.html" : path);
}
/** A mirror of the Vercel routing in apps/strip/vercel.json: header rules, then static files, then rewrites. */
const vercel = () => JSON.parse(readFileSync(join(appRoot, "vercel.json"), "utf8"));
const rx = (source) => new RegExp(`^${source}$`);
function vercelHeaders(path) {
  const out = {};
  for (const r of vercel().headers) if (rx(r.source).test(path)) for (const h of r.headers) out[h.key] = h.value;
  return out;
}
function vercelServer() {
  const root = resolve(appRoot, vercel().outputDirectory);
  return async (path) => {
    const direct = await readUnder(root, path === "/" ? "/index.html" : path);
    if (direct.status === 200 || direct.status === 403) return direct;
    for (const r of vercel().rewrites) if (rx(r.source).test(path)) return readUnder(root, r.destination);
    return { status: 404, body: "not found" };
  };
}
const ports = { app: Number(process.env.APP_PORT ?? 5182), gallery: Number(process.env.GALLERY_PORT ?? 5183), baseline: Number(process.env.BASELINE_PORT ?? 5184), vercel: Number(process.env.VERCEL_PORT ?? 5185) };
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve(ports.app, "app", spaServer("dist/app"), SECURITY_HEADERS);
  serve(ports.gallery, "gallery", spaServer("dist/gallery"), SECURITY_HEADERS);
  serve(ports.baseline, "baseline", baseline, {});
  serve(ports.vercel, "vercel", vercelServer(), vercelHeaders);
  console.log(`app-server: ${ports.app} app, ${ports.gallery} gallery, ${ports.baseline} baseline, ${ports.vercel} vercel mirror`);
}
