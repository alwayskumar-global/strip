import { describe, expect, it } from "vitest";
import { DecodeClientError, createDecodeClient } from "./decode-client.js";
import type { WorkerLike } from "./decode-client.js";
import type { FromWorker, ToWorker } from "./decode-protocol.js";
function fakeWorker() {
  const sent: Array<{ msg: ToWorker; transfer: Transferable[] | undefined }> = [];
  const w: WorkerLike = {
    onmessage: null,
    postMessage(msg, transfer) {
      sent.push({ msg: msg as ToWorker, transfer });
    },
    terminate() {},
  };
  return { w, sent, reply: (m: FromWorker) => w.onmessage?.({ data: m }) };
}
const init = { wasmUrl: "/assets/zxing_reader-abc.wasm", maxWidth: 8, maxHeight: 8 };
describe("decode client", () => {
  it("posts init with the wasm url and mode video, and resolves ready on ready", async () => {
    const f = fakeWorker();
    const c = createDecodeClient(f.w, init);
    expect(f.sent[0]?.msg).toEqual({ type: "init", wasmUrl: init.wasmUrl, maxWidth: 8, maxHeight: 8, mode: "video" });
    expect(c.idle).toBe(false);
    f.reply({ type: "ready" });
    await c.ready;
    expect(c.idle).toBe(true);
  });
  it("init-error rejects ready with the given code", async () => {
    const f = fakeWorker();
    const c = createDecodeClient(f.w, init);
    f.reply({ type: "init-error", code: "UNSUPPORTED_ENVIRONMENT", message: "no wasm" });
    await expect(c.ready).rejects.toMatchObject({ code: "UNSUPPORTED_ENVIRONMENT" });
    await expect(c.ready).rejects.toBeInstanceOf(DecodeClientError);
  });
  it("a frame is posted with its buffer in the transfer list; one submitted while busy is dropped and nothing is posted", async () => {
    const f = fakeWorker();
    const c = createDecodeClient(f.w, init);
    f.reply({ type: "ready" });
    const buf = new ArrayBuffer(16);
    const p = c.submitFrame(2, 2, buf);
    expect(f.sent.length).toBe(2);
    expect(f.sent[1]?.msg).toMatchObject({ type: "frame", width: 2, height: 2, buffer: buf });
    expect(f.sent[1]?.transfer).toEqual([buf]);
    expect(c.idle).toBe(false);
    expect(await c.submitFrame(2, 2, new ArrayBuffer(16))).toEqual({ kind: "dropped" });
    expect(f.sent.length).toBe(2);
    f.reply({ type: "outcome", id: 1, outcome: { kind: "not_found" } });
    expect(await p).toEqual({ kind: "not_found" });
    expect(c.idle).toBe(true);
  });
  it("before ready every frame is dropped", async () => {
    const f = fakeWorker();
    const c = createDecodeClient(f.w, init);
    expect(await c.submitFrame(1, 1, new ArrayBuffer(4))).toEqual({ kind: "dropped" });
    expect(f.sent.length).toBe(1);
  });
  it("outcome and error messages mark idle again", async () => {
    const f = fakeWorker();
    const c = createDecodeClient(f.w, init);
    f.reply({ type: "ready" });
    const p1 = c.submitFrame(1, 1, new ArrayBuffer(4));
    f.reply({ type: "error", id: 1, code: "INVALID_INPUT", message: "bad" });
    await expect(p1).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(c.idle).toBe(true);
    const p2 = c.submitFrame(1, 1, new ArrayBuffer(4));
    expect(f.sent.length).toBe(3);
    f.reply({ type: "outcome", id: 2, outcome: { kind: "found", bytes: Uint8Array.of(1) } });
    expect((await p2).kind).toBe("found");
    expect(c.idle).toBe(true);
  });
});
