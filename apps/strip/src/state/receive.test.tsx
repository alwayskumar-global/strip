import fc from "fast-check";
import { encode } from "@strip/codec";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createReceiveSession, MAX_LOGGED_PHOTO_PACKETS } from "../services/receive-session.js";
import { downloadFile } from "../services/download.js";
import { ReceiveView } from "../views/ReceiveView.js";
import { RECEIVE_PHASES, toReceiveVM } from "../views/receive-vm.js";
import { markupText } from "../views/board-copy.test-support.js";
import { percentOf, receiveInputOf } from "./receive-facts.js";
import { initialReceive, reduceReceive, type ReceiveEvent, type ReceiveState } from "./receive.js";
const payload = (n: number, seed = 3): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 29 + seed + (i >> 7)) & 255);
const KINDS = ["START", "STOP", "START_OVER", "KEEP", "SWITCH", "CANCEL", "DOWNLOAD", "RECEIVE_ANOTHER", "DISCARD", "SCAN_AGAIN", "BACK", "NOT_NOW", "CAMERA_API_MISSING", "PUSH_SLOW"] as const;
const counters = (solved: number, total: number, distinct: number, complete: boolean) => ({ solved, total, distinct, complete });
const pushArb = (gen: number): fc.Arbitrary<ReceiveEvent> =>
  fc.oneof(
    fc.record({ t: fc.constant("PUSHED" as const), gen: fc.constant(gen), source: fc.constantFrom<"camera" | { photo: number }>("camera", { photo: 1 }), result: fc.oneof(
      fc.record({ k: fc.constant("accepted" as const), counters: fc.record({ solved: fc.nat(20), total: fc.constant(20), distinct: fc.nat(30), complete: fc.boolean() }) }),
      fc.record({ k: fc.constant("ignored" as const), reason: fc.constantFrom("DUPLICATE_PACKET" as const, "SESSION_MISMATCH" as const, "ALREADY_COMPLETE" as const, "DENSE_STORE_FULL" as const) }),
      fc.record({ k: fc.constant("rejected" as const), code: fc.constantFrom("BAD_CRC", "BAD_HEADER", "HASH_MISMATCH", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_VERSION", "BAD_METADATA") }),
    ) }) as fc.Arbitrary<ReceiveEvent>,
    fc.constantFrom(...KINDS).map((t) => ({ t }) as ReceiveEvent),
    fc.constantFrom("NotAllowedError", "NotFoundError", "AbortError").map((name) => ({ t: "CAMERA_FAIL", name }) as ReceiveEvent),
    fc.record({ t: fc.constant("CAMERA_OK" as const), torch: fc.boolean() }) as fc.Arbitrary<ReceiveEvent>,
    fc.record({ t: fc.constant("ADD_PHOTO" as const), name: fc.constant("a.jpg"), size: fc.integer({ min: 1, max: 30_000_000 }) }) as fc.Arbitrary<ReceiveEvent>,
    fc.constantFrom<ReceiveEvent>({ t: "PANEL", action: "primary" }, { t: "PANEL", action: "secondary" }, { t: "PHOTO_DONE", gen: 0, row: { id: 1, name: "a.jpg", found: 3 } }, { t: "REMOVE_PHOTO", id: 1 }),
  );
describe("Receive reducer (P21, R12.1, R12.2, R12.6)", () => {
  // Feature: unit (P21): the phase is one of 10, done only when the codec is complete, terminal states leave only by restart
  it("P21: for any event sequence the phase is one of 10, done implies complete, and done and failed are left only by restart events", () => {
    const restart = new Set(["RECEIVE_ANOTHER", "DISCARD", "SCAN_AGAIN", "REBUILT", "PANEL", "REMOVE_PHOTO", "START_OVER"]);
    fc.assert(
      fc.property(fc.array(pushArb(0), { maxLength: 60 }), (events) => {
        let s: ReceiveState = initialReceive;
        for (const ev of events) {
          const before = s;
          s = reduceReceive(before, ev).state;
          expect(RECEIVE_PHASES as readonly string[]).toContain(s.phase);
          if (s.phase === "done") expect(s.counters.complete).toBe(true);
          if ((before.phase === "done" || before.phase === "failed") && s.phase !== before.phase) expect(restart.has(ev.t), `${before.phase} left by ${ev.t}`).toBe(true);
          if (s.gen !== before.gen) s = { ...s, gen: 0 }; // events below are generated for gen 0; a restart bumps it, so keep them live
        }
      }),
      { numRuns: 200 },
    );
  });
  it("a stale generation is dropped: no state change", () => {
    const s = { ...initialReceive, gen: 3 };
    const ev: ReceiveEvent = { t: "PUSHED", gen: 2, source: "camera", result: { k: "accepted", counters: counters(5, 10, 5, false) } };
    expect(reduceReceive(s, ev).state).toBe(s);
  });
  it("complete goes to done and reads the result; HASH_MISMATCH from a photo is the hash panel", () => {
    const done = reduceReceive(initialReceive, { t: "PUSHED", gen: 0, source: { photo: 1 }, result: { k: "accepted", counters: counters(10, 10, 12, true) } });
    expect(done.state.phase).toBe("done");
    expect(done.effects).toContain("READ_RESULT");
    const bad = reduceReceive(initialReceive, { t: "PUSHED", gen: 0, source: { photo: 1 }, result: { k: "rejected", code: "HASH_MISMATCH", hashes: { expected: "a", actual: "b" } } });
    expect(bad.state.panel?.kind).toBe("hash");
  });
});
describe("Receive counters over real Packets (P23, P26)", () => {
  // Feature: unit (P23): seen, distinct, solved and percent never decrease; percent 100 only when complete
  it("P23: for any Packet order with duplicates and a foreign session the counters never decrease and 100 means complete", async () => {
    const enc = await encode({ bytes: payload(8000), name: "a.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
    const foreign = await encode({ bytes: payload(5000, 9), name: "b.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
    const mine = enc.page();
    const other = foreign.page();
    await fc.assert(
      fc.asyncProperty(fc.array(fc.integer({ min: 0, max: mine.length + other.length + 3 }), { minLength: 1, maxLength: 30 }), async (picks) => {
        const session = createReceiveSession(0);
        let s: ReceiveState = initialReceive;
        let last = { seen: 0, distinct: 0, solved: 0, pct: 0 };
        for (const i of picks) {
          const bytes = i < mine.length ? (mine[i] as Uint8Array) : i < mine.length + other.length ? (other[i - mine.length] as Uint8Array) : (mine[0] as Uint8Array);
          const p = await session.push(bytes, { photo: 1 });
          s = reduceReceive(s, { t: "PUSHED", gen: 0, source: { photo: 1 }, result: p.result, ...(p.sessionOf === undefined ? {} : { sessionOf: p.sessionOf }) }).state;
          const c = s.counters;
          const pct = percentOf(c.solved, c.total, c.complete);
          expect(c.seen).toBeGreaterThanOrEqual(last.seen);
          expect(c.distinct).toBeGreaterThanOrEqual(last.distinct);
          expect(c.solved).toBeGreaterThanOrEqual(last.solved);
          expect(pct).toBeGreaterThanOrEqual(last.pct);
          if (pct === 100) expect(c.complete).toBe(true);
          last = { seen: c.seen, distinct: c.distinct, solved: c.solved, pct };
        }
      }),
      { numRuns: 25 },
    );
  }, 120_000);
  // Feature: unit (P26): the rebuilt session equals a fresh session fed the remaining sources in order
  it("P26: removing any photo gives the same progress as a fresh session fed the remaining photos in order", async () => {
    const enc = await encode({ bytes: payload(9000), name: "a.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
    const packets = enc.page();
    await fc.assert(
      fc.asyncProperty(fc.array(fc.array(fc.integer({ min: 0, max: packets.length - 1 }), { minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 4 }), fc.nat(3), async (photos, rm) => {
        const full = createReceiveSession(0);
        for (let id = 0; id < photos.length; id++) for (const i of photos[id] as number[]) await full.push(packets[i] as Uint8Array, { photo: id });
        const removed = rm % photos.length;
        const rebuilt = await full.rebuildWithout(removed, 1);
        const fresh = createReceiveSession(1);
        for (let id = 0; id < photos.length; id++) if (id !== removed) for (const i of photos[id] as number[]) await fresh.push(packets[i] as Uint8Array, { photo: id });
        expect(rebuilt.progress()).toEqual(fresh.progress());
      }),
      { numRuns: 25 },
    );
  }, 120_000);
});
describe("P26 regression and the log bound (Resolved question 43)", () => {
  it("regression [[[0],[0]],0]: two photos both carrying Packet 0; removing photo 0 keeps Packet 0 through photo 1", async () => {
    const enc = await encode({ bytes: payload(9000), name: "a.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
    const p0 = enc.page()[0] as Uint8Array;
    const full = createReceiveSession(0);
    await full.push(p0, { photo: 0 });
    await full.push(p0, { photo: 1 });
    const rebuilt = await full.rebuildWithout(0, 1);
    const fresh = createReceiveSession(1);
    await fresh.push(p0, { photo: 1 });
    expect(rebuilt.progress()).toEqual(fresh.progress());
    expect(rebuilt.progress().distinct).toBe(1);
  });
  it("the log never exceeds 24 photos x 9 symbols, whatever is pushed", async () => {
    const enc = await encode({ bytes: payload(9000), name: "a.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
    const p0 = enc.page()[0] as Uint8Array;
    const s = createReceiveSession(0);
    for (let photo = 0; photo < 30; photo++) for (let k = 0; k < 9; k++) await s.push(p0, { photo });
    expect(MAX_LOGGED_PHOTO_PACKETS).toBe(216);
    expect(s.photoLogSize()).toBeLessThanOrEqual(MAX_LOGGED_PHOTO_PACKETS);
    expect(s.photoLogSize() * 1732).toBeLessThanOrEqual(24 * 9 * 1732);
  });
});
describe("Photo list text and download (P34, R5.16, R12.14, R12.15)", () => {
  const matrixless = (photos: Array<{ id: number; name: string; found: number }>): string => renderToStaticMarkup(<ReceiveView vm={toReceiveVM({ phase: "empty", seen: 0, solved: 0, distinct: 0, total: 0, photos })} />);
  // Feature: unit (P34): the count tag and row texts use singular and plural forms and m is the sum of the found counts
  it("P34: singular and plural forms; m is the sum of the found counts", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 9 }), { minLength: 1, maxLength: 8 }), (founds) => {
        const photos = founds.map((found, i) => ({ id: i, name: `p${i}.jpg`, found }));
        const text = markupText(matrixless(photos));
        const n = photos.length;
        const m = founds.reduce((a, b) => a + b, 0);
        expect(text).toContain(`${n} ${n === 1 ? "photo" : "photos"} · ${m} ${m === 1 ? "symbol" : "symbols"}`);
        for (const p of photos) expect(text).toContain(`${p.found} ${p.found === 1 ? "symbol" : "symbols"} found`);
      }),
    );
    expect(markupText(matrixless([]))).toContain("None");
  });
  it("download uses the original name and MIME and the received bytes", async () => {
    const bytes = payload(300);
    let blob: Blob | undefined;
    let clicked = 0;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b: Blob | MediaSource) => {
      blob = b as Blob;
      return "blob:test";
    };
    const a = { href: "", download: "", rel: "", click: () => void clicked++, remove: () => undefined } as unknown as HTMLAnchorElement;
    const doc = { createElement: () => a, body: { append: () => undefined } } as unknown as Document;
    try {
      downloadFile(bytes, "notes.pdf", "application/pdf", doc);
    } finally {
      URL.createObjectURL = orig;
    }
    expect([a.download, clicked, blob?.type]).toEqual(["notes.pdf", 1, "application/pdf"]);
    expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toEqual(bytes);
  });
  it("receiveInputOf shows the done file facts and the failed hashes", () => {
    const s: ReceiveState = { ...initialReceive, phase: "done", result: { name: "n.pdf", mime: "application/pdf", size: 188_416, hash12: "a1b2c3d4e5f6" }, counters: { seen: 5, skipped: 0, solved: 4, total: 4, distinct: 5, complete: true } };
    const i = receiveInputOf(s);
    expect([i.doneName, i.doneSize, i.doneHash, i.pct]).toEqual(["n.pdf", "184 KB", "a1b2 c3d4 e5f6…", 100]);
  });
});
