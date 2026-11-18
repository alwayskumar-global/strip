// Generates dist/app/sw.js and dist/app/sw-manifest.json after `vite build` (R14.4). No dependency.
// The precache list is every emitted file except sw.js, sw-manifest.json, source maps and .vite; the cache name is a hash of
// the names and bytes of those files, so any change to any byte gives a new cache and a new sw.js.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? (n === ".vite" ? [] : walk(p)) : [p];
  });
}
/** The URLs to precache for a built directory, sorted, plus "/" for the shell. */
export function precacheList(dist) {
  const urls = walk(dist)
    .map((p) => `/${relative(dist, p).split("\\").join("/")}`)
    .filter((u) => u !== "/sw.js" && u !== "/sw-manifest.json" && !u.endsWith(".map"));
  return ["/", ...urls].sort();
}
export function cacheName(dist, list = precacheList(dist)) {
  const h = createHash("sha256");
  for (const u of list) {
    h.update(u);
    h.update("\0");
    h.update(u === "/" ? readFileSync(join(dist, "index.html")) : readFileSync(join(dist, u.slice(1))));
    h.update("\0");
  }
  return `strip-${h.digest("hex").slice(0, 12)}`;
}
export function buildSw(dist) {
  const list = precacheList(dist);
  const name = cacheName(dist, list);
  const template = readFileSync(join(here, "sw.template.js"), "utf8");
  const sw = template.replace("__CACHE__", name).replace("__PRECACHE__", JSON.stringify(list));
  writeFileSync(join(dist, "sw.js"), sw);
  writeFileSync(join(dist, "sw-manifest.json"), JSON.stringify({ cache: name, precache: list }, null, 1));
  return { name, list };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = process.argv[2] ?? join(here, "../dist/app");
  const { name, list } = buildSw(dist);
  console.log(`sw.js: ${name}, ${list.length} precached URLs`);
}
