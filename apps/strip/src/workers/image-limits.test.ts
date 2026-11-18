import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { IMAGE_LONG_SIDE, IMAGE_MAX_BYTES, IMAGE_MAX_PHOTOS } from "../limits.js";
import { refuseImage, scaleOf } from "../state/image-rules.js";
import { createDecodeClient, type WorkerLike } from "./decode-client.js";
import type { FromWorker, ToWorker } from "./decode-protocol.js";
describe("image rules (P29, R12.11 to R12.13)", () => {
  // Feature: unit (P29): scaleOf keeps each side at most 4096, aspect within one pixel, leaves smaller images unscaled
  it("P29: scaleOf keeps both sides within 4096 (at most 16,777,216 pixels), the aspect within one pixel, and smaller images unscaled", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 40_000 }), fc.integer({ min: 1, max: 40_000 }), (w, h) => {
        const s = scaleOf(w, h);
        expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(IMAGE_LONG_SIDE);
        expect(s.width * s.height).toBeLessThanOrEqual(16_777_216);
        if (Math.max(w, h) <= IMAGE_LONG_SIDE) expect([s.width, s.height, s.scaled]).toEqual([w, h, false]);
        else {
          expect(Math.max(s.width, s.height)).toBe(IMAGE_LONG_SIDE);
          // the scaled aspect ratio matches within one pixel of the short side
          const k = IMAGE_LONG_SIDE / Math.max(w, h);
          expect(Math.abs(s.width - w * k)).toBeLessThanOrEqual(1);
          expect(Math.abs(s.height - h * k)).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
  it("the 20 MB and 24-photo limits hold at the boundary", () => {
    expect(refuseImage(IMAGE_MAX_BYTES, 0)).toBeNull();
    expect(refuseImage(IMAGE_MAX_BYTES + 1, 0)).toBe("imgbig");
    expect(refuseImage(1, IMAGE_MAX_PHOTOS - 1)).toBeNull();
    expect(refuseImage(1, IMAGE_MAX_PHOTOS)).toBe("imgmany");
    expect(IMAGE_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(IMAGE_MAX_PHOTOS).toBe(24);
  });
});
describe("decode client (P30, R12.3, R12.10)", () => {
  // Feature: unit (P30): at most one decode in flight; every busy submit resolves dropped with no post; a dropped bitmap is closed
  it("P30: for any interleaving at most one decode is in flight, busy submits drop without a post, and dropped bitmaps are closed", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom("frame", "bitmap", "finish"), { minLength: 1, maxLength: 40 }), async (ops) => {
        let inFlight = 0;
        let maxInFlight = 0;
        let lastId = 0;
        const worker: WorkerLike = {
          onmessage: null,
          terminate: () => undefined,
          postMessage(m) {
            const msg = m as ToWorker;
            if (msg.type === "init") queueMicrotask(() => worker.onmessage?.({ data: { type: "ready" } satisfies FromWorker }));
            else if (msg.type !== "release") {
              inFlight++;
              maxInFlight = Math.max(maxInFlight, inFlight);
              lastId = msg.id;
            }
          },
        };
        const c = createDecodeClient(worker, { wasmUrl: "/x.wasm", maxWidth: 10, maxHeight: 10 });
        await c.ready;
        let closed = 0;
        let droppedBitmaps = 0;
        const results: Array<Promise<string>> = [];
        for (const op of ops) {
          if (op === "finish") {
            if (inFlight > 0) {
              inFlight--;
              worker.onmessage?.({ data: { type: "outcome", id: lastId, outcome: { kind: "not_found" } } satisfies FromWorker });
              await Promise.resolve();
            }
          } else if (op === "frame") results.push(c.submitFrame(1, 1, new ArrayBuffer(4)).then((o) => o.kind));
          else {
            const busy = !c.idle;
            if (busy) droppedBitmaps++;
            results.push(c.submitBitmap({ width: 1, height: 1, close: () => void closed++ } as unknown as ImageBitmap).then((o) => o.kind));
          }
        }
        expect(maxInFlight).toBeLessThanOrEqual(1);
        expect(closed).toBe(droppedBitmaps);
        await Promise.resolve();
        expect(results.length).toBe(ops.filter((o) => o !== "finish").length);
      }),
      { numRuns: 80 },
    );
  });
});
