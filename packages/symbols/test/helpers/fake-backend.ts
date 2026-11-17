import type { BackendResult, DecoderBackend, ReaderOptions } from "../../src/decoder-backend.js";
import type { ImageDataLike } from "../../src/types.js";
export type FakeCall = { frame: ImageDataLike; options: ReaderOptions; buffer: ArrayBufferLike; snapshot: Uint8ClampedArray };
/** Controllable backend: each read stays pending until resolveNext or rejectNext. */
export function fakeBackend() {
  const calls: FakeCall[] = [];
  const waiting: Array<(r: BackendResult | undefined) => void> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const backend: DecoderBackend = {
    read(frame, options) {
      calls.push({ frame, options, buffer: frame.data.buffer, snapshot: frame.data.slice() });
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        waiting.push((r) => {
          inFlight--;
          resolve(r);
        });
      });
    },
  };
  return {
    backend,
    calls,
    get inFlight() {
      return inFlight;
    },
    get maxInFlight() {
      return maxInFlight;
    },
    get waiting() {
      return waiting.length;
    },
    resolveNext(r: BackendResult | undefined): void {
      const w = waiting.shift();
      if (!w) throw new Error("no pending read");
      w(r);
    },
  };
}
