// R7.13: decode of a 12 MP page photo with maxSymbols 9. Budget: median <= 250 ms on the Reference_Machine.
import { expect, it } from "vitest";
import { decodeFrame } from "../src/decode.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { makePage, photo } from "../test/helpers/page-photo.js";
import { readerWasmBytes } from "../test/helpers/wasm-bytes.js";
import { MACHINE, fmt, measure } from "./measure.js";
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
it("12 MP page photo decode median is at most 250 ms with maxSymbols 9 (R7.13)", async () => {
  resetBackend();
  const page = makePage(0);
  const img = photo(page, 0, { fill: 0.92 });
  const first = await decodeFrame(img, { wasm, maxSymbols: 9 });
  expect(first.kind === "found_many" && first.symbols.length === 9).toBe(true); // timing a miss would be meaningless
  const s = await measure(() => decodeFrame(img, { wasm, maxSymbols: 9 }));
  process.stdout.write(`[perf] decode 3000x4000 page photo (9 symbols, v30 L, ${img.pixelsPerModule.toFixed(2)} px/module, Typical profile, rotation <= 10 deg): ${fmt(s)} | budget 250 ms | ${MACHINE}\n`);
  expect(s.median).toBeLessThanOrEqual(250);
}, 600_000);
