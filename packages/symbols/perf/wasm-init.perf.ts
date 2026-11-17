// R7.7: wasm initialisation (compile plus instantiate) in Node. Budget: median <= 500 ms.
// Cold by construction: V8 can reuse a compiled module for identical bytes, so every run appends a distinct wasm
// custom section (valid, ignored by the engine) and gets a module nobody compiled before. The first decode after init is
// timed too, so the report covers compile + instantiate + first decode, not a cached module.
import { expect, it } from "vitest";
import { decodeFrame } from "../src/decode.js";
import { encodeSymbol } from "../src/encode-symbol.js";
import { ensureBackend, resetBackend } from "../src/wasm-runtime.js";
import { matrixToImageData } from "../test/helpers/matrix-to-image.js";
import { readerWasmBytes } from "../test/helpers/wasm-bytes.js";
import { MACHINE, fmt, measure } from "./measure.js";
function uniqueModule(base: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(base.length + 8);
  out.set(base);
  out.set([0x00, 0x06, 0x01, 0x75, n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255], base.length); // custom section "u"
  return out;
}
it("wasm init median is at most 500 ms in Node, cold module (R7.7)", async () => {
  const base = readerWasmBytes();
  const frame = matrixToImageData(encodeSymbol(Uint8Array.from({ length: 40 }, (_, i) => i + 1), { version: 3 }), 4, 4);
  let n = 0;
  const init: number[] = [];
  const first: number[] = [];
  const s = await measure(async () => {
    resetBackend();
    const t0 = process.hrtime.bigint();
    const src = { kind: "bytes", bytes: uniqueModule(base, ++n) } as const;
    await ensureBackend(src);
    const t1 = process.hrtime.bigint();
    const r = await decodeFrame(frame, { wasm: src });
    const t2 = process.hrtime.bigint();
    expect(r.kind).toBe("found");
    init.push(Number(t1 - t0) / 1e6);
    first.push(Number(t2 - t1) / 1e6);
  });
  void s;
  const timed = (a: number[]): number[] => a.slice(3);
  const med = (a: number[]): number => {
    const s = [...a].sort((x, y) => x - y);
    return ((s[9] as number) + (s[10] as number)) / 2;
  };
  const mi = med(timed(init));
  const mf = med(timed(first));
  process.stdout.write(
    `[perf] wasm cold init (compile + instantiate, Node, ${base.length} bytes + unique section): median ${mi.toFixed(2)} ms; first decode after init: median ${mf.toFixed(2)} ms; init + first decode: ${(mi + mf).toFixed(2)} ms | budget 500 ms | ${MACHINE} | whole-run stats ${fmt(s)}\n`,
  );
  expect(mi).toBeLessThanOrEqual(500);
}, 300_000);
