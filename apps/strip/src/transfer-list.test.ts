import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecodeClient } from "./decode-client.js";
import type { WorkerLike } from "./decode-client.js";
import type { FromWorker, ToWorker } from "./decode-protocol.js";
import { transferListOf } from "./transfer-list.js";
const sym = (n: number) => ({ bytes: new Uint8Array(n) });
describe("transferListOf (R16.12)", () => {
  it("found gives one buffer, found_many gives every symbol's buffer, the rest none", () => {
    const one = sym(5);
    expect(transferListOf({ kind: "found", bytes: one.bytes })).toEqual([one.bytes.buffer]);
    const many = [sym(3), sym(4), sym(5)];
    expect(transferListOf({ kind: "found_many", symbols: many, skipped: 0 })).toEqual(many.map((s) => s.bytes.buffer));
    expect(transferListOf({ kind: "not_found" })).toEqual([]);
    expect(transferListOf({ kind: "dropped" })).toEqual([]);
    expect(transferListOf({ kind: "not_strip_packet", length: 3000 })).toEqual([]);
    expect(transferListOf({ kind: "found_many", symbols: [], skipped: 2 })).toEqual([]);
  });
  // Feature: symbols, Property 34: for any found_many outcome of 0 to 16 symbols, transferListOf contains the bytes.buffer of every symbol exactly once and no other buffer, and the client posts init with the given maxSymbols and drops a frame while busy
  it("P34: every symbol buffer exactly once and nothing else; the client sends maxSymbols and drops while busy", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 300 }), { maxLength: 16 }), fc.integer({ min: 1, max: 16 }), (lengths, maxSymbols) => {
        const symbols = lengths.map(sym);
        const list = transferListOf({ kind: "found_many", symbols, skipped: 1 });
        expect(list.length).toBe(symbols.length);
        expect(new Set(list).size).toBe(symbols.length);
        symbols.forEach((s, i) => expect(list[i]).toBe(s.bytes.buffer));
        const sent: ToWorker[] = [];
        const w: WorkerLike = { onmessage: null, postMessage: (m) => void sent.push(m as ToWorker), terminate() {} };
        const c = createDecodeClient(w, { wasmUrl: "/x.wasm", maxWidth: 4, maxHeight: 4, maxSymbols });
        expect(sent[0]).toMatchObject({ type: "init", maxSymbols });
        w.onmessage?.({ data: { type: "ready" } satisfies FromWorker });
        void c.submitFrame(1, 1, new ArrayBuffer(4));
        const before = sent.length;
        void c.submitFrame(1, 1, new ArrayBuffer(4));
        expect(sent.length).toBe(before);
      }),
      { numRuns: 100 },
    );
  });
  it("the client passes a found_many outcome through unchanged and init omits maxSymbols when not given", async () => {
    const sent: ToWorker[] = [];
    const w: WorkerLike = { onmessage: null, postMessage: (m) => void sent.push(m as ToWorker), terminate() {} };
    const c = createDecodeClient(w, { wasmUrl: "/x.wasm", maxWidth: 4, maxHeight: 4 });
    expect("maxSymbols" in (sent[0] as object)).toBe(false);
    w.onmessage?.({ data: { type: "ready" } satisfies FromWorker });
    const p = c.submitFrame(1, 1, new ArrayBuffer(4));
    const outcome = { kind: "found_many" as const, symbols: [sym(3)], skipped: 0 };
    w.onmessage?.({ data: { type: "outcome", id: 1, outcome } satisfies FromWorker });
    expect(await p).toBe(outcome);
    expect(c.idle).toBe(true);
  });
});
