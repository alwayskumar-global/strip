// R7.5: decode median <= 20 ms for a 1280x720 frame and <= 40 ms for a 1920x1080 frame.
import { expect, it } from "vitest";
import { decodeFrame } from "../src/decode.js";
import { resetBackend } from "../src/wasm-runtime.js";
import { readerWasmBytes } from "../test/helpers/wasm-bytes.js";
import { makeFrame } from "./frames.js";
import { MACHINE, fmt, measure } from "./measure.js";
const wasm = { kind: "bytes", bytes: readerWasmBytes() } as const;
for (const [w, h, version, ppm, budget] of [[1280, 720, 20, 4, 20], [1920, 1080, 30, 5, 40]] as const) {
  it(`decode median is at most ${budget} ms for a ${w}x${h} frame (R7.5)`, async () => {
    resetBackend();
    const { frame, payload, content } = makeFrame(version, "L", w, h, ppm);
    const first = await decodeFrame(frame, { wasm });
    expect(first.kind === "found" && first.bytes.every((v, i) => v === payload[i])).toBe(true); // timing a miss would be meaningless
    const s = await measure(() => decodeFrame(frame, { wasm }));
    process.stdout.write(`[perf] decode ${w}x${h} (${content}): ${fmt(s)} | budget ${budget} ms | ${MACHINE}\n`);
    expect(s.median).toBeLessThanOrEqual(budget);
  }, 300_000);
}
