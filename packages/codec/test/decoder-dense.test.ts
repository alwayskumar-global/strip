import { describe, expect, it } from "vitest";
import { createDecoderWith } from "../src/decoder.js";
import { encodeWith } from "../src/encoder.js";
import { DEFAULT_FORMAT } from "../src/format.js";
import { decodePacket } from "../src/packet.js";

const bytesOf = (n: number, seed = 1): Uint8Array => {
  let x = seed >>> 0 || 1;
  return Uint8Array.from({ length: n }, () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x >>> 24;
  });
};
const payload = (n: number, name = "p") => ({ bytes: bytesOf(n, n + 5), name, mime: "" });
const small = { packetSize: 46 }; // blockSize 16
const allDense = { ...DEFAULT_FORMAT, D: 1 }; // every repair packet is dense
const noGauss = { maxGaussianBlocks: 0 }; // dense capacity 64, and no elimination can run

async function setup(n: number, format = allDense) {
  const e = await encodeWith(payload(n), small, { format });
  const probe = await encodeWith(payload(n), small, { format });
  const truth = Array.from({ length: e.K }, () => decodePacket(probe.next()).payload.slice());
  const sys = Array.from({ length: e.K }, () => e.next());
  return { e, sys, truth, K: e.K };
}

describe("dense rows are stored, never peeled (R5.18)", () => {
  it("stores a dense packet as a row, counts it, and leaves adjacency and equations alone", async () => {
    const { e, sys, K } = await setup(600);
    const d = createDecoderWith(noGauss, allDense);
    await d.push(sys[0] as Uint8Array);
    for (let i = 0; i < 5; i++) expect((await d.push(e.next())).kind).toBe("accepted");
    expect(d.progress().distinctPackets).toBe(6);
    expect(d.progress().solvedBlocks).toBe(1);
    expect(d.progress().totalBlocks).toBe(K);
    const dbg = d.debug();
    expect(dbg.denseStored).toBe(5);
    expect(dbg.liveEquations).toBe(0);
    const rows = d.denseRows();
    expect(rows.length).toBe(5);
    for (const r of rows) {
      expect(r.columns.length).toBeGreaterThan(0);
      expect(r.folded).toEqual([]);
    }
  });

  it("a dense-only repair stream never solves a Block by peeling", async () => {
    const { e, K } = await setup(600);
    const d = createDecoderWith(noGauss, allDense);
    for (let i = 0; i < K; i++) e.next();
    for (let i = 0; i < 40; i++) await d.push(e.next());
    expect(d.progress().solvedBlocks).toBe(0);
    expect(d.debug().denseStored).toBe(40);
  });
});

describe("dense store bound (R5.19, R5.20)", () => {
  it("holds at most maxGaussianBlocks + 64 rows and ignores the rest with DENSE_STORE_FULL", async () => {
    const { e, K } = await setup(900);
    const d = createDecoderWith(noGauss, allDense);
    expect(K).toBeGreaterThan(40);
    for (let i = 0; i < K; i++) e.next();
    for (let i = 0; i < 64; i++) expect((await d.push(e.next())).kind).toBe("accepted");
    expect(d.debug().denseStored).toBe(64);
    expect(d.debug().denseCapacity).toBe(64);
    const extra = e.next();
    const before = { p: d.progress(), dbg: d.debug(), rows: d.denseRows() };
    const s = await d.push(extra);
    expect(s).toMatchObject({ kind: "ignored", reason: "DENSE_STORE_FULL" });
    expect(d.progress()).toEqual(before.p);
    expect(d.debug()).toEqual(before.dbg);
    expect(d.denseRows()).toEqual(before.rows);
    // Its sequence number was not recorded as seen: a retransmission is judged again, not a duplicate.
    expect(await d.push(extra)).toMatchObject({ kind: "ignored", reason: "DENSE_STORE_FULL" });
    expect(d.progress().distinctPackets).toBe(64);
  });

  it("the capacity follows maxGaussianBlocks + 64", async () => {
    const { e, K } = await setup(900);
    const d = createDecoderWith({ maxGaussianBlocks: 3 }, allDense);
    for (let i = 0; i < K; i++) e.next();
    for (let i = 0; i < 80; i++) await d.push(e.next());
    expect(d.debug().denseCapacity).toBe(67);
    expect(d.debug().denseStored).toBe(67);
  });

  it("accepts the same packet after rows have been freed", async () => {
    const { e, sys, K } = await setup(900);
    const d = createDecoderWith(noGauss, allDense);
    const skipped = K - 1;
    for (let i = 0; i < K; i++) e.next();
    for (let i = 0; i < 64; i++) await d.push(e.next());
    const extra = e.next();
    expect((await d.push(extra)).kind).toBe("ignored");
    for (let i = 0; i < K; i++) if (i !== skipped) await d.push(sys[i] as Uint8Array);
    expect(d.progress().solvedBlocks).toBe(K - 1);
    expect(d.debug().denseStored).toBeLessThan(64); // rows without the last column are gone
    const s = await d.push(extra);
    expect(s).toMatchObject({ kind: "accepted" });
    expect(d.progress().distinctPackets).toBe(K - 1 + 64 + 1);
  });
});

describe("sparse and systematic packets keep peeling while the store is full (R5.21)", () => {
  it("accepts and uses them", async () => {
    const mixed = { ...DEFAULT_FORMAT, D: 2 }; // alternate repair packets are dense
    const { e, sys, K } = await setup(1500, mixed);
    const d = createDecoderWith(noGauss, mixed);
    for (let i = 0; i < K; i++) e.next();
    let fullSeen = false;
    const sparse: Uint8Array[] = [];
    for (let i = 0; i < 400 && sparse.length < 10 * K; i++) {
      const p = e.next();
      const seq = decodePacket(p).seq;
      const dense = (seq - K) % 2 === 1;
      if (dense) {
        const s = await d.push(p);
        if (s.kind === "ignored") fullSeen = true;
      } else {
        sparse.push(p);
      }
    }
    expect(fullSeen).toBe(true);
    expect(d.debug().denseStored).toBe(64);
    const before = d.progress().solvedBlocks;
    for (const p of sys) expect((await d.push(p)).kind).toBe("accepted");
    for (const p of sparse) expect((await d.push(p)).kind).not.toBe("rejected");
    expect(d.progress().solvedBlocks).toBe(K);
    expect(d.progress().solvedBlocks).toBeGreaterThan(before);
  });
});

describe("fully solved rows are discarded (R5.22)", () => {
  it("frees a row once all its columns are solved, and never stores one that is already solved", async () => {
    const { e, sys, K } = await setup(200);
    const d = createDecoderWith(noGauss, allDense);
    for (let i = 0; i < K; i++) e.next();
    for (let i = 0; i < 6; i++) await d.push(e.next());
    expect(d.debug().denseStored).toBe(6);
    for (const p of sys) await d.push(p);
    expect(d.progress().solvedBlocks).toBe(K);
    expect(d.debug().denseStored).toBe(0);
    const s = await d.push(e.next());
    expect(s.kind).toBe("accepted"); // all columns known, counted, nothing stored
    expect(d.debug().denseStored).toBe(0);
    expect(d.progress().distinctPackets).toBe(K + 6 + 1);
  });
});

describe("lazy folding (R2.11, R2.12)", () => {
  it("XORs each solved column into the payload exactly once and matches a naive recomputation", async () => {
    const { e, sys, truth, K } = await setup(700);
    const d = createDecoderWith(noGauss, allDense);
    for (let i = 0; i < K; i++) e.next();
    const originals: Uint8Array[] = [];
    for (let i = 0; i < 4; i++) {
      const p = e.next();
      originals.push(decodePacket(p).payload.slice());
      await d.push(p);
    }
    const solvedCols = [0, 3, 5, 8, 11];
    for (const c of solvedCols) await d.push(sys[c] as Uint8Array);

    const check = () => {
      const rows = d.denseRows();
      expect(rows.length).toBe(4);
      rows.forEach((r, i) => {
        const folded = r.columns.filter((c) => solvedCols.includes(c));
        expect(r.folded).toEqual(folded);
        const want = Uint8Array.from(originals[i] as Uint8Array);
        for (const c of folded) for (let t = 0; t < want.length; t++) want[t] = (want[t] as number) ^ ((truth[c] as Uint8Array)[t] as number);
        expect(r.payload).toEqual(want);
      });
    };
    d.foldDense();
    check();
    d.foldDense(); // folding again must not XOR anything twice
    check();
    await d.push(sys[14] as Uint8Array);
    d.foldDense();
    solvedCols.push(14);
    check();
  });
});
