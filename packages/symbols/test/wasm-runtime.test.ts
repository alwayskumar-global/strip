import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { DecoderBackend } from "../src/decoder-backend.js";
import { SymbolError } from "../src/errors.js";
import * as runtime from "../src/wasm-runtime.js";
import { ensureBackend, resetBackend } from "../src/wasm-runtime.js";
import { readerWasmBytes } from "./helpers/wasm-bytes.js";
const g = globalThis as unknown as { fetch?: unknown };
const fakeBackend: DecoderBackend = { read: () => Promise.resolve(undefined) };
async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    expect(e).toBeInstanceOf(SymbolError);
    return (e as SymbolError).code;
  }
}
beforeEach(() => resetBackend());
describe("wasm runtime (R5.7, R5.8, R8.5, R9.2)", () => {
  it("R5.8: no source gives INVALID_INPUT and fetch is never called", async () => {
    const saved = g.fetch;
    let calls = 0;
    g.fetch = () => (calls++, Promise.reject(new Error("network")));
    try {
      expect(await codeOf(ensureBackend(undefined))).toBe("INVALID_INPUT");
    } finally {
      g.fetch = saved;
    }
    expect(calls).toBe(0);
  });
  it("R5.7: a source initialises once; two calls return the same promise and the loader runs once", async () => {
    let loads = 0;
    const loader = () => (loads++, Promise.resolve(fakeBackend));
    const src = { kind: "bytes", bytes: new Uint8Array(4) } as const;
    const a = ensureBackend(src, loader);
    const b = ensureBackend(src, loader);
    expect(b).toBe(a);
    await a;
    expect(loads).toBe(1);
    expect(ensureBackend({ kind: "url", url: "/x.wasm" }, loader).catch(() => undefined)).toBeInstanceOf(Promise);
    expect(loads).toBe(1);
  });
  it("R5.7: a second, different source after init is rejected with INVALID_INPUT", async () => {
    const loader = () => Promise.resolve(fakeBackend);
    await ensureBackend({ kind: "url", url: "/a.wasm" }, loader);
    expect(await codeOf(ensureBackend({ kind: "url", url: "/b.wasm" }, loader))).toBe("INVALID_INPUT");
    expect(await codeOf(ensureBackend({ kind: "bytes", bytes: new Uint8Array(2) }, loader))).toBe("INVALID_INPUT");
    await ensureBackend({ kind: "url", url: "/a.wasm" }, loader); // the same source is still fine
  });
  it("R8.5: corrupt bytes reject with UNSUPPORTED_ENVIRONMENT, and a later call with good bytes succeeds (real reader)", async () => {
    expect(await codeOf(ensureBackend({ kind: "bytes", bytes: new Uint8Array([1, 2, 3, 4]) }))).toBe("UNSUPPORTED_ENVIRONMENT");
    const backend = await ensureBackend({ kind: "bytes", bytes: readerWasmBytes() });
    expect(Object.keys(backend)).toEqual(["read"]);
  });
  it("R9.2: initialising from bytes makes no network request", async () => {
    const saved = g.fetch;
    let calls = 0;
    g.fetch = () => (calls++, Promise.reject(new Error("network")));
    try {
      await ensureBackend({ kind: "bytes", bytes: readerWasmBytes() });
    } finally {
      g.fetch = saved;
    }
    expect(calls).toBe(0);
  });
  it("R11.6: the runtime exposes only ensureBackend and resetBackend, and a backend only read", () => {
    expect(Object.keys(runtime).sort()).toEqual(["ensureBackend", "resetBackend"]);
  });
  it("R11.1, R11.2: package.json lists zxing-wasm as exactly 3.1.7", () => {
    const pkg = JSON.parse(readFileSync(`${process.cwd()}/package.json`, "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["zxing-wasm"]).toBe("3.1.7");
  });
});
