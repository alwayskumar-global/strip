import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Task 4.5 (R19.10, R22.5): the notices name every component the app adds, with exact version, licence and licence text.
const root = process.cwd();
const notices = readFileSync(join(root, "apps/strip/public/THIRD_PARTY_NOTICES"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "apps/strip/package.json"), "utf8")) as { dependencies: Record<string, string> };
describe("THIRD_PARTY_NOTICES for the app (R22.5)", () => {
  it("names react and react-dom with their exact versions and the MIT text, and the IBM Plex fonts with the OFL text", () => {
    for (const n of ["react", "react-dom"]) expect(notices).toMatch(new RegExp(`${n} ${(pkg.dependencies[n] as string).replace(/\./g, "\\.")}\\s+MIT\\b`));
    expect(notices).toContain("Copyright (c) Meta Platforms, Inc. and affiliates.");
    expect(notices).toContain(readFileSync(join(root, "apps/strip/node_modules/react/LICENSE"), "utf8").trim());
    expect(notices).toMatch(/IBM Plex Sans \(@ibm\/plex-sans 1\.1\.0\)\s+SIL OFL 1\.1/);
    expect(notices).toMatch(/IBM Plex Mono \(@ibm\/plex-mono 2\.5\.0\)\s+SIL OFL 1\.1/);
    expect(notices).toContain("SIL OPEN FONT LICENSE Version 1.1");
    expect(notices).toContain("Copyright © 2017 IBM Corp.");
  });
  it("still names the earlier components", () => {
    for (const n of ["qr 0.7.2", "zxing-wasm 3.1.7", "zxing-cpp", "Apache License"]) expect(notices).toContain(n);
  });
});
// Task 4.5 (P50, R18.1 to R18.3): the Bundle_Report and its gate.
import { cpSync, mkdtempSync, readFileSync as rf, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { build } from "vite";
interface Rep { pass: boolean; firstLoad: { gzip: number; raw: number; brotli: number; files: string[] }; wasm: { raw: number; gzip: number; brotli: number; files: string[] }; worker: { raw: number; files: string[] }; files: Array<{ url: string; raw: number; gzip: number; brotli: number }> }
describe("bundle report (P50)", () => {
  it("a built app is under the 400 KB first-load gzip budget; the wasm and worker are reported separately", { timeout: 60_000 }, async () => {
    const mod = (await import(/* @vite-ignore */ join(root, "apps/strip/scripts/bundle-report.mjs"))) as { report(d: string): Rep; BUDGET_GZIP: number };
    process.env["NODE_ENV"] = "production";
    const dist = mkdtempSync(join(tmpdir(), "strip-bundle-src-")); // an own build, so the parallel dist test cannot race with it
    await build({ root: join(root, "apps/strip"), mode: "production", logLevel: "silent", configFile: join(root, "apps/strip/vite.config.ts"), build: { outDir: dist, emptyOutDir: true } });
    const copy = mkdtempSync(join(tmpdir(), "strip-bundle-"));
    cpSync(dist, copy, { recursive: true });
    const r = mod.report(copy);
    expect(r.pass).toBe(true);
    expect(r.firstLoad.gzip).toBeLessThanOrEqual(400_000);
    expect(r.firstLoad.files.some((f) => f.endsWith(".wasm") || f.includes("decode.worker"))).toBe(false);
    expect(r.wasm.files).toHaveLength(1);
    expect(r.wasm.raw).toBeLessThanOrEqual(1_000_000);
    expect(r.worker.files).toHaveLength(1);
    for (const f of r.files) expect([f.raw, f.gzip, f.brotli].every((n) => n > 0), f.url).toBe(true);
    // The gate fails when the first-load set grows past the budget.
    const big = mkdtempSync(join(tmpdir(), "strip-bundle-big-"));
    cpSync(dist, big, { recursive: true });
    writeFileSync(join(big, "assets/huge.js"), randomBytes(450_000));
    expect(mod.report(big).pass).toBe(false);
    expect(rf(join(root, ".gitignore"), "utf8")).toContain("bundle-report.json");
  });
});
