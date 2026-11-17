// Harness for the symbols e2e tests: exposes the @strip/symbols barrel, the codec and the same-origin wasm source
// through window.__symbols. Only public entries are imported, as for any app. This file is outside src, so it may
// read the clock for measurements.
import { createDecoder, encode } from "@strip/codec";
import { createFrameDecoder, decodeFrame, encodeSymbol, renderToCanvas, SymbolError } from "@strip/symbols";
import type { DecodeOutcome } from "@strip/symbols";
import { createDecodeClient } from "../src/decode-client.ts";
import type { DecodeClient, WorkerLike } from "../src/decode-client.ts";
import { wasmSource } from "../src/symbols-wasm.ts";

const violations: string[] = [];
document.addEventListener("securitypolicyviolation", (e) => violations.push(`${e.violatedDirective} ${e.blockedURI}`));
const longTasks: number[] = [];
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) longTasks.push(e.duration);
  }).observe({ type: "longtask", buffered: true });
} catch {
  /* longtask unsupported: the test checks that the observer exists */
}

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string): Uint8Array => Uint8Array.from({ length: h.length / 2 }, (_, i) => parseInt(h.slice(2 * i, 2 * i + 2), 16));
const payload = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 131 + 7) & 255);

function render(bytes: Uint8Array, ppm = 4): ImageData {
  const m = encodeSymbol(bytes, { version: 30, ecc: "L" });
  const { width, height } = renderToCanvas(ctx, m, { ppm });
  return ctx.getImageData(0, 0, width, height);
}
const errInfo = (e: unknown) => ({ ok: false as const, code: e instanceof SymbolError ? e.code : "OTHER", message: e instanceof Error ? e.message : String(e) });

let client: DecodeClient | undefined;
const api = {
  wasmUrl: wasmSource.url,
  violations,
  longTasks,
  /** Encode a file with the codec, send every packet through qr, canvas and the wasm decoder, and rebuild the file. */
  async roundTrip(size = 6000) {
    try {
      const bytes = payload(size);
      const e = await encode({ bytes, name: "t.bin", mime: "application/octet-stream" }, { packetSize: 1732 });
      const d = createDecoder();
      let n = 0;
      for (let i = 0; i < e.K + 8 && !d.progress().complete; i++) {
        const r = await decodeFrame(render(e.next()), { wasm: wasmSource });
        if (r.kind !== "found") return { ok: false as const, code: `outcome ${r.kind}`, message: "" };
        await d.push(r.bytes);
        n++;
      }
      const res = d.progress().complete ? d.result() : undefined;
      return { ok: true as const, complete: d.progress().complete, packets: n, same: res !== undefined && toHex(res.payload) === toHex(bytes) };
    } catch (err) {
      return errInfo(err);
    }
  },
  /** Decode one symbol made from the given hex bytes. */
  async decodeOnce(hex: string) {
    try {
      const r = await decodeFrame(render(fromHex(hex)), { wasm: wasmSource });
      return { ok: true as const, kind: r.kind, hex: r.kind === "found" ? toHex(r.bytes) : "" };
    } catch (err) {
      return errInfo(err);
    }
  },
  /** Time compile plus instantiate of the reader wasm (fresh page, same origin, no cache). */
  async measureInit() {
    const t0 = performance.now();
    await createFrameDecoder({ wasm: wasmSource, maxWidth: 64, maxHeight: 64 });
    return performance.now() - t0;
  },
  async startWorker(maxWidth = 640, maxHeight = 640) {
    try {
      const worker = new Worker(new URL("../src/decode.worker.ts", import.meta.url), { type: "module" });
      client = createDecodeClient(worker as unknown as WorkerLike, { wasmUrl: wasmSource.url, maxWidth, maxHeight });
      await client.ready;
      return { ok: true as const };
    } catch (err) {
      return { ...errInfo(err), code: (err as { code?: string }).code ?? "OTHER" };
    }
  },
  /** Decode `count` distinct symbols through the worker, as fast as the worker allows. */
  async workerSequence(count: number) {
    if (client === undefined) throw new Error("worker not started");
    const frames: ImageData[] = [];
    for (let i = 0; i < count; i++) frames.push(render(payload(40 + i), 4));
    const stats = { found: 0, dropped: 0, notFound: 0, errors: 0, exact: 0 };
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    await sleep(300); // let long tasks from rendering the frames be delivered before the baseline
    const base = longTasks.length;
    const t0 = performance.now();
    for (let i = 0; i < count; i++) {
      const f = frames[i] as ImageData;
      let o: DecodeOutcome;
      try {
        o = await client.submitFrame(f.width, f.height, f.data.buffer.slice(0) as ArrayBuffer);
      } catch {
        stats.errors++;
        continue;
      }
      if (o.kind === "found") {
        stats.found++;
        if (toHex(o.bytes) === toHex(payload(40 + i))) stats.exact++;
      } else if (o.kind === "dropped") stats.dropped++;
      else stats.notFound++;
    }
    const ms = performance.now() - t0;
    await sleep(300);
    return { ...stats, ms, longTasks: longTasks.slice(base), observerSupported: PerformanceObserver.supportedEntryTypes.includes("longtask") };
  },
};
(window as unknown as { __symbols: typeof api }).__symbols = api;
