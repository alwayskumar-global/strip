import fc from "fast-check";
import { createDecoder } from "@strip/codec";
import { describe, expect, it } from "vitest";
import { FPS_DEFAULT } from "../limits.js";
import { pageCount, paginate, sessionShort, sessionShorts } from "../state/paper.js";
import { encodeFile, symbolOf, totalPackets } from "./paper-pages.js";
const payload = (n: number, seed = 7): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 131 + seed + (i >> 8)) & 255);
const nameArb = fc.stringMatching(/^[A-Za-z0-9 _.-]{1,40}$/).filter((n) => n !== "." && n !== "..");
const mimeArb = fc.constantFrom("application/pdf", "text/plain", "image/png", "application/octet-stream");
describe("paper pipeline (P1, P7 to P10, P25)", () => {
  // Feature: unit (P1): page() Packets pushed to a codec Decoder complete with identical bytes, name and MIME
  it("P1: for any file, name and MIME the page() Packets rebuild the file", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 30_000 }), nameArb, mimeArb, async (size, name, mime) => {
        const bytes = payload(size, size);
        const enc = await encodeFile(bytes, name, mime);
        const dec = createDecoder();
        for (const p of enc.page()) await dec.push(p);
        const r = dec.result();
        expect(r.payload).toEqual(bytes);
        expect([r.metadata.name, r.metadata.mime]).toEqual([name, mime]);
      }),
      { numRuns: 12 },
    );
  }, 120_000);
  // Feature: unit (P9): any permutation of the tile Packets completes
  it("P9: for any permutation of the tile Packets a Decoder completes with identical bytes", async () => {
    const bytes = payload(9000);
    const enc = await encodeFile(bytes, "p.bin", "application/octet-stream");
    const packets = enc.page();
    await fc.assert(
      fc.asyncProperty(fc.shuffledSubarray(packets, { minLength: packets.length, maxLength: packets.length }), async (perm) => {
        const dec = createDecoder();
        for (const p of perm) await dec.push(p);
        expect(dec.progress().complete).toBe(true);
        expect(dec.result().payload).toEqual(bytes);
      }),
      { numRuns: 15 },
    );
  }, 120_000);
  // Feature: unit (P7): K and T at 16, 32, 64, 128, 184 and 256 KB equal the pinned values
  it("P7: K, T, loop seconds and pages at 16 to 256 KB equal the pinned values", async () => {
    const pinned: Array<[number, number, number]> = [[16, 10, 24], [32, 20, 41], [64, 39, 67], [128, 78, 112], [184, 111, 149], [256, 155, 200]];
    for (const [kb, K, T] of pinned) {
      const enc = await encodeFile(payload(kb * 1024), "field-notes-2026.pdf", "application/pdf");
      expect([enc.K, enc.page().length, totalPackets(enc.K)]).toEqual([K, T, T]);
      expect(Math.round(T / FPS_DEFAULT)).toBe(Math.round(T / 8));
      expect(pageCount(T)).toBe(Math.ceil(T / 9));
    }
  }, 120_000);
  // Feature: unit (P8): paginate gives ceil(T / 9) pages, each sequence once and in order, labels and captions unique
  it("P8: paginate covers every Packet once, in order, with unique labels and captions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 400 }), (T) => {
        const pages = paginate(T);
        expect(pages).toHaveLength(Math.ceil(T / 9));
        const tiles = pages.flatMap((p) => p.tiles);
        expect(tiles.map((t) => t.index)).toEqual(Array.from({ length: T }, (_, i) => i));
        expect(new Set(tiles.map((t) => t.of)).size).toBe(T);
        expect(new Set(pages.flatMap((p) => p.tiles.map((t) => `${p.page}:${t.label}`))).size).toBe(T);
        expect(tiles.every((t) => /^P\d+·\d\d$/.test(t.label) && t.of.endsWith(`/${T}`))).toBe(true);
        expect(pages.slice(0, -1).every((p) => p.tiles.length === 9)).toBe(true);
      }),
    );
    expect(paginate(149)[0]?.tiles[0]).toEqual({ index: 0, label: "P1·01", of: "1/149" });
    expect(paginate(149)).toHaveLength(17);
  });
  // Feature: unit (P10): encodeSymbol at packetSize 1732 has size 137 and drawn viewBox 145
  it("P10: a 1732-byte Packet is a version-30 symbol of 137 modules, drawn in a 145 viewBox", async () => {
    const enc = await encodeFile(payload(5000), "a.bin", "application/octet-stream");
    for (const p of enc.page()) {
      expect(p.length).toBe(1732);
      const m = symbolOf(p);
      expect([m.size, m.version, m.size + 8]).toEqual([137, 30, 145]);
    }
  });
  // Feature: unit (P25): Session_Short is 4 uppercase hex digits, or 8 for both when the two 4-digit forms are equal
  it("P25: Session_Short is 4 uppercase hex digits; two ids with equal shorts show 8 digits each", () => {
    expect(sessionShort(0x7f3a0000)).toBe("7F3A");
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), fc.integer({ min: 0, max: 0xffffffff }), (a, b) => {
        expect(sessionShort(a)).toMatch(/^[0-9A-F]{4}$/);
        const [x, y] = sessionShorts(a, b);
        if (sessionShort(a) === sessionShort(b) && a !== b) {
          expect([x.length, y.length]).toEqual([8, 8]);
          expect(x).not.toBe(y);
        } else expect([x, y]).toEqual([sessionShort(a), sessionShort(b)]);
      }),
    );
  });
});
