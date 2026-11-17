// Integration of @strip/codec and @strip/symbols. Lives outside src, so it may import runtime values from the codec (R13.3).
import { existsSync } from "node:fs";
import { createDecoder, encode } from "@strip/codec";
import fc from "fast-check";
import { beforeAll, describe, expect, it } from "vitest";
import { decodeFrame } from "../src/decode.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { QR_DEFAULTS } from "../src/capacity.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { matrixToImageData } from "./helpers/matrix-to-image.js";
import { mulberry32, randomBytes } from "./helpers/prng.js";
import { readerWasmBytes } from "./helpers/wasm-bytes.js";
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
beforeAll(() => resetBackend());
describe("codec integration (R13, R1.10)", () => {
  // Feature: symbols, Property 18: for any seeded file, each Packet through encodeSymbol, matrixToImageData, decodeFrame and the codec decoder completes with the identical file
  it("P18: a file sent as symbols at packetSize 1732 is received intact (N = 12 files, fixed seed)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 6000 }), fc.integer({ min: 0, max: 2 ** 31 - 1 }), async (size, seed) => {
        const file = randomBytes(mulberry32(seed), size);
        const enc = await encode({ bytes: file, name: "f.bin", mime: "application/octet-stream" }, { packetSize: QR_DEFAULTS.screen.packetSize });
        const dec = createDecoder();
        let sent = 0;
        while (!dec.progress().complete && sent < enc.K + 12) {
          const packet = enc.next();
          expect(packet.length).toBeLessThanOrEqual(QR_DEFAULTS.screen.packetSize);
          const r = await decodeFrame(matrixToImageData(encodeSymbol(packet), 4, 4), { wasm });
          expect(r.kind).toBe("found");
          if (r.kind !== "found") return;
          expect(r.bytes).toEqual(packet);
          await dec.push(r.bytes);
          sent++;
        }
        expect(dec.progress().complete).toBe(true);
        expect(dec.result().payload).toEqual(file);
      }),
      { numRuns: 12, seed: 1732 },
    );
  }, 300_000);
  it("R13.3: the integration test lives outside src", () => {
    expect(existsSync(`${process.cwd()}/test/codec-integration.test.ts`)).toBe(true);
    expect(existsSync(`${process.cwd()}/src/codec-integration.test.ts`)).toBe(false);
  });
});
