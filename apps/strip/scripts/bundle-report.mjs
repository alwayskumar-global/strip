// Bundle_Report (R18.1 to R18.3): raw, gzip and brotli size of every built file, the first-load set and the budget gate.
// Budget: first-load main JS + CSS + fonts at most 400 KB gzip. The .wasm (at most 1,000,000 bytes raw) and the decode worker
// are NOT in that sum; their sizes are reported separately. Exits 1 over budget. No dependency.
import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
export const BUDGET_GZIP = 400 * 1000;
export const WASM_MAX_RAW = 1_000_000;
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? (n === ".vite" ? [] : walk(join(d, n))) : [join(d, n)]));
const kind = (u) => (u.endsWith(".wasm") ? "wasm" : /\/assets\/decode\.worker-.*\.js$/.test(u) ? "worker" : /\/assets\/.*\.js$/.test(u) ? "js" : u.endsWith(".css") ? "css" : u.endsWith(".woff2") ? "font" : "other");
export function report(dist) {
  const files = walk(dist)
    .map((p) => ({ url: `/${relative(dist, p).split("\\").join("/")}`, buf: readFileSync(p) }))
    .filter((f) => !f.url.endsWith(".map") && f.url !== "/sw.js" && f.url !== "/sw-manifest.json")
    .map((f) => ({ url: f.url, kind: kind(f.url), raw: f.buf.length, gzip: gzipSync(f.buf, { level: 9 }).length, brotli: brotliCompressSync(f.buf).length }));
  const sum = (list, k) => list.reduce((a, f) => a + f[k], 0);
  // Fonts are woff2, already compressed: their gzip size is what a gzip transfer would send, as for any other file.
  const firstLoad = files.filter((f) => ["js", "css", "font"].includes(f.kind));
  const wasm = files.filter((f) => f.kind === "wasm");
  const worker = files.filter((f) => f.kind === "worker");
  return {
    budgetGzipBytes: BUDGET_GZIP,
    firstLoad: { files: firstLoad.map((f) => f.url), raw: sum(firstLoad, "raw"), gzip: sum(firstLoad, "gzip"), brotli: sum(firstLoad, "brotli") },
    wasm: { files: wasm.map((f) => f.url), raw: sum(wasm, "raw"), gzip: sum(wasm, "gzip"), brotli: sum(wasm, "brotli"), maxRaw: WASM_MAX_RAW },
    worker: { files: worker.map((f) => f.url), raw: sum(worker, "raw"), gzip: sum(worker, "gzip"), brotli: sum(worker, "brotli") },
    totals: { raw: sum(files, "raw"), gzip: sum(files, "gzip"), brotli: sum(files, "brotli") },
    files,
    pass: sum(firstLoad, "gzip") <= BUDGET_GZIP && sum(wasm, "raw") <= WASM_MAX_RAW,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? join(here, "../dist/app");
  const r = report(dist);
  writeFileSync(join(here, "../bundle-report.json"), JSON.stringify(r, null, 1));
  const kb = (n) => `${(n / 1000).toFixed(1)} KB`;
  console.log("| file | kind | raw | gzip | brotli |\n|---|---|---|---|---|");
  for (const f of r.files) console.log(`| ${f.url} | ${f.kind} | ${f.raw} | ${f.gzip} | ${f.brotli} |`);
  console.log(`first load (js + css + fonts): raw ${kb(r.firstLoad.raw)}, gzip ${kb(r.firstLoad.gzip)}, budget ${kb(BUDGET_GZIP)}`);
  console.log(`wasm: raw ${r.wasm.raw} (max ${WASM_MAX_RAW}), gzip ${r.wasm.gzip}; worker: raw ${r.worker.raw}, gzip ${r.worker.gzip} (reported separately)`);
  if (!r.pass) {
    console.error("bundle budget exceeded");
    process.exit(1);
  }
}
