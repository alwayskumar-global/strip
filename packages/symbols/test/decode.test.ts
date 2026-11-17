import { encode } from "@strip/codec";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeFrame, decodeFrameWith } from "../src/decode.js";
import type { DecoderBackend } from "../src/decoder-backend.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { SymbolError } from "../src/errors.js";
import type { WasmSource } from "../src/types.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { matrixToImageData } from "./helpers/matrix-to-image.js";
import { readerWasmBytes } from "./helpers/wasm-bytes.js";
export const wasm: WasmSource = { kind: "bytes", bytes: readerWasmBytes() };
const render = (b: Uint8Array, opts: { ecc?: "L" | "M" | "Q" | "H"; version?: number } = {}) =>
  matrixToImageData(encodeSymbol(b, opts), 4, 4);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
beforeAll(() => resetBackend());
describe("decodeFrame", () => {
  it("R5.1, R5.2, R5.7: a rendered symbol decodes asynchronously to the exact bytes, with version and ecc reported", async () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7 + 3) & 255);
    const p = decodeFrame(render(bytes, { ecc: "M" }), { wasm });
    expect(p).toBeInstanceOf(Promise);
    const r = await p;
    expect(r.kind).toBe("found");
    if (r.kind !== "found") return;
    expect(same(r.bytes, bytes)).toBe(true);
    expect(r.ecc).toBe("M");
    expect(r.version).toBe(encodeSymbol(bytes, { ecc: "M" }).version);
    expect(r.corners?.length).toBe(4);
  });
  it("P1 unit, R1.7, R5.6: all 256 byte values round-trip through qr, 4 ppm raster and zxing", async () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (const ecc of ["L", "M", "Q", "H"] as const) {
      const r = await decodeFrame(render(all, { ecc }), { wasm });
      expect(r.kind === "found" && same(r.bytes, all), ecc).toBe(true);
    }
  });
  it("P1 unit, R1.8: 30 real codec packets (sizes 2953, 1000, 500) round-trip byte for byte", async () => {
    let n = 0;
    for (const [packetSize, fileLen] of [[2953, 40000], [1000, 12000], [500, 6000]] as const) {
      const file = Uint8Array.from({ length: fileLen }, (_, i) => (i * 2654435761) >>> 24);
      const enc = await encode({ bytes: file, name: "f.bin", mime: "application/octet-stream" }, { packetSize });
      const packets = enc.page().slice(0, 10);
      expect(packets.length).toBe(10);
      for (const pkt of packets) {
        const r = await decodeFrame(render(pkt), { wasm });
        expect(r.kind === "found" && same(r.bytes, pkt)).toBe(true);
        n++;
      }
    }
    expect(n).toBe(30);
  }, 120_000);
  it("R5.4: found bytes are a fresh copy that the caller may mutate", async () => {
    const bytes = Uint8Array.from({ length: 40 }, (_, i) => i + 1);
    const a = await decodeFrame(render(bytes), { wasm });
    const b = await decodeFrame(render(bytes), { wasm });
    expect(a.kind === "found" && b.kind === "found").toBe(true);
    if (a.kind === "found" && b.kind === "found") {
      expect(a.bytes).not.toBe(b.bytes);
      a.bytes.fill(0);
      expect(same(b.bytes, bytes)).toBe(true);
    }
  });
  it("R5.3: a blank frame is not_found and does not throw", async () => {
    const data = new Uint8ClampedArray(64 * 64 * 4).fill(255);
    expect(await decodeFrame({ width: 64, height: 64, data }, { wasm })).toEqual({ kind: "not_found" });
  });
  it("P24, R5.4: a payload longer than 2953 bytes gives not_strip_packet", async () => {
    // Feature: symbols, Property 24: for any payload longer than 2953 bytes in a decoded symbol, the outcome is not_strip_packet
    for (const len of [2954, 3000, 5000, 60000]) {
      const backend: DecoderBackend = { read: () => Promise.resolve({ bytes: new Uint8Array(len) }) };
      const r = await decodeFrameWith(() => Promise.resolve(backend), { width: 1, height: 1, data: new Uint8ClampedArray(4) }, {});
      expect(r).toEqual({ kind: "not_strip_packet", length: len });
    }
    const ok: DecoderBackend = { read: () => Promise.resolve({ bytes: new Uint8Array(2953) }) };
    const r = await decodeFrameWith(() => Promise.resolve(ok), { width: 1, height: 1, data: new Uint8ClampedArray(4) }, {});
    expect(r.kind).toBe("found");
  });
  it("R5.8: no wasm source gives INVALID_INPUT", async () => {
    resetBackend();
    await expect(decodeFrame({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, {})).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(SymbolError).toBeDefined();
  });
});
