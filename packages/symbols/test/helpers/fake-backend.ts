import type { BackendResult, DecoderBackend, ReaderOptions } from "../../src/decoder-backend.js";
import type { ImageDataLike } from "../../src/types.js";
export type FakeCall = { frame: ImageDataLike; options: ReaderOptions; buffer: ArrayBufferLike; snapshot: Uint8ClampedArray };
/** Controllable backend: each read stays pending until resolveNext or rejectNext. */
export function fakeBackend() {
  const calls: FakeCall[] = [];
  const waiting: Array<(r: BackendResult | undefined) => void> = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const manyCalls: FakeCall[] = [];
  /** When set, readMany resolves at once with this list (a function gets the call index). */
  let autoMany: BackendResult[] | ((call: number) => BackendResult[]) | undefined;
  const manyWaiting: Array<(r: BackendResult[]) => void> = [];
  const backend: DecoderBackend = {
    readMany(frame, options) {
      manyCalls.push({ frame, options, buffer: frame.data.buffer, snapshot: frame.data.slice() });
      const index = manyCalls.length - 1;
      if (autoMany !== undefined) return Promise.resolve(typeof autoMany === "function" ? autoMany(index) : autoMany);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((resolve) => {
        manyWaiting.push((r) => {
          inFlight--;
          resolve(r);
        });
      });
    },
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
    manyCalls,
    setMany(v: BackendResult[] | ((call: number) => BackendResult[]) | undefined): void {
      autoMany = v;
    },
    resolveNextMany(r: BackendResult[]): void {
      const w = manyWaiting.shift();
      if (!w) throw new Error("no pending readMany");
      w(r);
    },
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
