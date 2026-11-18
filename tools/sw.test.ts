import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { build } from "vite";
import { beforeAll, describe, expect, it } from "vitest";
// Task 4.2 (P45, R14.4): the generated service worker and its precache list.
const app = join(process.cwd(), "apps/strip");
interface Sw {
  buildSw(dist: string): { name: string; list: string[] };
  cacheName(dist: string): string;
}
let dist = "";
let sw: Sw;
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? (n === ".vite" ? [] : walk(join(d, n))) : [join(d, n)]));
beforeAll(async () => {
  process.env["NODE_ENV"] = "production";
  dist = mkdtempSync(join(tmpdir(), "strip-sw-"));
  await build({ root: app, mode: "production", logLevel: "silent", configFile: join(app, "vite.config.ts"), build: { outDir: dist, emptyOutDir: true } });
  const modulePath = join(app, "scripts/build-sw.mjs");
  sw = (await import(/* @vite-ignore */ modulePath)) as Sw;
  sw.buildSw(dist);
}, 120_000);
describe("service worker generation (P45)", () => {
  it("the precache list is every emitted file except sw.js, sw-manifest.json, maps and .vite, plus the shell '/'", () => {
    const manifest = JSON.parse(readFileSync(join(dist, "sw-manifest.json"), "utf8")) as { cache: string; precache: string[] };
    const emitted = walk(dist).map((p) => `/${relative(dist, p)}`).filter((u) => !["/sw.js", "/sw-manifest.json"].includes(u) && !u.endsWith(".map"));
    expect(manifest.precache).toEqual(["/", ...emitted].sort());
    for (const needle of [".wasm", "/fonts/IBMPlexSans-Regular.woff2", "/fonts/IBMPlexMono-SemiBold.woff2", "/THIRD_PARTY_NOTICES", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png", "/icons/apple-touch-icon.png", "/index.html"]) expect(manifest.precache.some((u) => u.endsWith(needle)), needle).toBe(true);
    for (const u of manifest.precache) expect(/^\/[^/]/.test(u) || u === "/", u).toBe(true); // same-origin paths only
    expect(manifest.precache.some((u) => u.includes("sw.js") || u.includes(".map") || u.includes(".vite"))).toBe(false);
  });
  it("sw.js embeds the cache name and the list, has no skipWaiting, and claims clients only after activation", () => {
    const text = readFileSync(join(dist, "sw.js"), "utf8");
    const { cache } = JSON.parse(readFileSync(join(dist, "sw-manifest.json"), "utf8")) as { cache: string };
    expect(text).toContain(`"${cache}"`);
    expect(text).not.toContain("skipWaiting");
    expect(text).toContain("clients.claim()");
    expect(text).not.toMatch(/https?:\/\//);
  });
  it("the cache name changes when any byte of any precached file changes, and not otherwise", () => {
    const copy = mkdtempSync(join(tmpdir(), "strip-sw2-"));
    cpSync(dist, copy, { recursive: true });
    const a = sw.cacheName(copy);
    expect(sw.cacheName(copy)).toBe(a);
    const target = walk(copy).find((p) => p.endsWith(".css")) as string;
    writeFileSync(target, `${readFileSync(target, "utf8")} `);
    expect(sw.cacheName(copy)).not.toBe(a);
    expect(existsSync(join(copy, "sw.js"))).toBe(true);
  });
});
